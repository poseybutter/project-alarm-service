import { NextResponse } from "next/server";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import {
    deleteTeamCalendarTaskEvent,
    getTeamCalendarAccessToken,
    type GoogleCalendarConnection,
    type TeamCalendarTaskInput,
    syncTeamCalendarTaskEvents,
    TeamCalendarPartialSyncError,
    TeamCalendarSyncError,
} from "@/infrastructure/google-calendar";
import { internalErrorResponse } from "@/shared/server/apiResponse";

// 업무 수만큼 Google API 를 순차 호출하므로 기본 실행 시간으로는 잘릴 수 있다.
export const maxDuration = 60;

/** 한 요청에서 처리할 업무 수 상한. 남으면 nextCursor 로 이어받는다. */
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;

export async function POST(request: Request) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (role !== "admin") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const supabase = createServiceSupabaseClient();

    try {
        const { data: setting, error: settingError } = await supabase
            .from("agent_team_calendar_settings")
            .select("calendar_id, connection_email")
            .eq("team_id", teamId)
            .maybeSingle();
        if (settingError) throw settingError;
        if (!setting?.calendar_id || !setting.connection_email) {
            return NextResponse.json(
                { message: "공용 팀 캘린더 ID가 설정되어 있지 않습니다" },
                { status: 400 },
            );
        }

        const { data: memberCalendars, error: memberCalendarError } =
            await supabase
                .from("agent_member_calendar_settings")
                .select("member, calendar_id")
                .eq("team_id", teamId);
        if (memberCalendarError) throw memberCalendarError;

        const calendarByMember = new Map(
            (memberCalendars ?? []).map((row) => [row.member, row.calendar_id]),
        );

        const { data: connection, error: connectionError } = await supabase
            .from("agent_calendar_connections")
            .select("member, email, access_token, refresh_token, expires_at")
            .eq("team_id", teamId)
            .eq("email", setting.connection_email)
            .maybeSingle();
        if (connectionError) throw connectionError;
        if (!connection) {
            return NextResponse.json(
                { message: "팀 캘린더 연결 계정을 찾을 수 없습니다" },
                { status: 400 },
            );
        }

        const accessToken = await getTeamCalendarAccessToken(
            supabase,
            teamId,
            connection as GoogleCalendarConnection,
        );

        const url = new URL(request.url);
        const requestedLimit = Number(url.searchParams.get("limit"));
        const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
            ? Math.min(requestedLimit, MAX_BATCH_SIZE)
            : DEFAULT_BATCH_SIZE;
        const requestedCursor = Number(url.searchParams.get("cursor"));
        const cursor = Number.isFinite(requestedCursor) ? requestedCursor : null;

        // 사용자가 캘린더에서 뺀 업무(show_on_team_calendar=false)까지 올리면
        // 껐던 일정이 되살아난다. 표시 대상만 가져온다.
        let query = supabase
            .from("tasks")
            .select(
                "id, member, proj, content, content_items, status, start_date, end_date, show_on_team_calendar, team_calendar_event_id, team_calendar_item_event_ids, team_calendar_id",
            )
            .eq("team_id", teamId)
            .eq("show_on_team_calendar", true)
            .order("id", { ascending: true })
            .limit(limit + 1); // 다음 배치 존재 여부 확인용으로 하나 더
        if (cursor !== null) query = query.gt("id", cursor);
        const { data: page, error: taskError } = await query;
        if (taskError) throw taskError;

        const hasMore = (page ?? []).length > limit;
        const tasks = (page ?? []).slice(0, limit);
        const nextCursor = hasMore ? tasks[tasks.length - 1].id : null;

        let synced = 0;
        let skipped = 0;
        const errors: Array<{ id: number; message: string }> = [];

        for (const task of (tasks ?? []) as TeamCalendarTaskInput[]) {
            const targetCalendarId = calendarByMember.get(task.member);
            if (!targetCalendarId) {
                skipped += 1;
                const message = "담당자별 캘린더 ID가 설정되어 있지 않습니다";
                errors.push({ id: task.id, message });
                await supabase
                    .from("tasks")
                    .update({ team_calendar_sync_error: message })
                    .eq("team_id", teamId)
                    .eq("id", task.id);
                continue;
            }

            try {
                // 항목 일정만 있는 업무는 base ID가 null 이므로, 항목 ID까지 함께 봐야
                // 캘린더가 바뀔 때 이전 캘린더의 일정이 남지 않는다.
                const previousEventIds = [
                    task.team_calendar_event_id,
                    ...(task.team_calendar_item_event_ids ?? []),
                ].filter((id): id is string => Boolean(id));
                const previousCalendarId =
                    previousEventIds.length > 0 &&
                    (!task.team_calendar_id || task.team_calendar_id !== targetCalendarId)
                        ? task.team_calendar_id || setting.calendar_id
                        : null;

                const result = await syncTeamCalendarTaskEvents({
                    accessToken,
                    calendarId: targetCalendarId,
                    task: previousCalendarId
                        ? {
                              ...task,
                              team_calendar_event_id: null,
                              team_calendar_item_event_ids: null,
                          }
                        : task,
                });

                const { error: updateError } = await supabase
                    .from("tasks")
                    .update({
                        team_calendar_event_id: result.baseEventId,
                        team_calendar_item_event_ids: result.itemEventIds.length
                            ? result.itemEventIds
                            : null,
                        team_calendar_id: targetCalendarId,
                        team_calendar_synced_at: new Date().toISOString(),
                        team_calendar_sync_error: null,
                    })
                    .eq("team_id", teamId)
                    .eq("id", task.id);
                if (updateError) throw updateError;

                // 이전 캘린더 정리는 새 일정과 DB 갱신이 끝난 뒤에 한다.
                if (previousCalendarId) {
                    for (const staleId of previousEventIds) {
                        await deleteTeamCalendarTaskEvent({
                            accessToken,
                            calendarId: previousCalendarId,
                            eventId: staleId,
                        });
                    }
                }
                synced += 1;
            } catch (err) {
                console.error(`[team-calendar-resync-task:${task.id}]`, err);
                // 사용자가 고칠 수 있는 사유는 업무별로 그대로 남긴다.
                const message =
                    err instanceof TeamCalendarSyncError
                        ? err.message
                        : "팀 캘린더 재동기화 실패";
                errors.push({ id: task.id, message });
                // 중간까지 만들어진 이벤트 ID 를 저장해야 고아 일정이 남지 않는다.
                const progress =
                    err instanceof TeamCalendarPartialSyncError
                        ? {
                              team_calendar_event_id: err.progress.baseEventId,
                              team_calendar_item_event_ids: err.progress
                                  .itemEventIds.length
                                  ? err.progress.itemEventIds
                                  : null,
                          }
                        : {};
                await supabase
                    .from("tasks")
                    .update({ ...progress, team_calendar_sync_error: message })
                    .eq("team_id", teamId)
                    .eq("id", task.id);
            }
        }

        return NextResponse.json({
            synced,
            skipped,
            failed: errors.length,
            errors,
            nextCursor,
        });
    } catch (error) {
        return internalErrorResponse(
            "team-calendar-resync",
            error,
            "팀 캘린더 재동기화에 실패했습니다.",
        );
    }
}
