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
import { mapWithConcurrency } from "@/shared/server/concurrency";
import {
    consumeSharedRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/shared/server/rateLimit";

// 업무 수만큼 Google API 를 호출하므로 기본 실행 시간으로는 잘릴 수 있다.
export const maxDuration = 60;

/** 한 요청에서 처리할 업무 수 상한. 남으면 nextCursor 로 이어받는다. */
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;

/**
 * 업무 동기화 동시 처리 한도. 연결 계정 하나로 호출하므로 Google 의
 * 사용자당 요청률 한도를 넘지 않게 낮춰 잡는다. 넘치면 429 백오프가 감속한다.
 */
const SYNC_CONCURRENCY = 4;

const MISSING_MEMBER_CALENDAR_MESSAGE =
    "담당자별 캘린더 ID가 설정되어 있지 않습니다";

/** 업무 하나의 처리 결과. 배치가 끝난 뒤 입력 순서대로 집계한다. */
type TaskSyncOutcome =
    | { kind: "synced" }
    | { kind: "skipped"; id: number; message: string }
    | { kind: "failed"; id: number; message: string };

export async function POST(request: Request) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (role !== "admin") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // 배치 이어받기 루프(최대 50회)가 정상 케이스이므로 그보다 넉넉히 잡는다.
    const rate = await consumeSharedRateLimit(
        requestRateLimitKey(request, "team-calendar-resync", user.email),
        { limit: 60, windowMs: 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

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

        // 순차 처리는 안전하지만 느리다. Google 요청률 한도 아래로 동시 처리하고,
        // 결과는 입력 순서대로 받아 집계·응답 형태는 순차 때와 동일하게 유지한다.
        const syncOneTask = async (
            task: TeamCalendarTaskInput,
        ): Promise<TaskSyncOutcome> => {
            const targetCalendarId = calendarByMember.get(task.member);
            if (!targetCalendarId) {
                // 같은 사유의 스킵이므로 DB 기록은 배치가 끝난 뒤 한 번에 모아 쓴다.
                return {
                    kind: "skipped",
                    id: task.id,
                    message: MISSING_MEMBER_CALENDAR_MESSAGE,
                };
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
                return { kind: "synced" };
            } catch (err) {
                console.error(`[team-calendar-resync-task:${task.id}]`, err);
                // 사용자가 고칠 수 있는 사유는 업무별로 그대로 남긴다.
                const message =
                    err instanceof TeamCalendarSyncError
                        ? err.message
                        : "팀 캘린더 재동기화 실패";
                // 중간까지 만들어진 이벤트 ID 를 저장해야 고아 일정이 남지 않는다.
                // 진행분은 업무마다 다르므로 모아 쓰지 않고 즉시 기록한다.
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
                return { kind: "failed", id: task.id, message };
            }
        };

        const outcomes = await mapWithConcurrency(
            tasks as TeamCalendarTaskInput[],
            SYNC_CONCURRENCY,
            syncOneTask,
        );

        let synced = 0;
        let skipped = 0;
        const errors: Array<{ id: number; message: string }> = [];
        const skippedTaskIds: number[] = [];
        for (const outcome of outcomes) {
            if (outcome.kind === "synced") {
                synced += 1;
                continue;
            }
            errors.push({ id: outcome.id, message: outcome.message });
            if (outcome.kind === "skipped") {
                skipped += 1;
                skippedTaskIds.push(outcome.id);
            }
        }

        // 스킵 사유는 전부 같은 메시지이므로 업무별 갱신 대신 한 번에 쓴다.
        if (skippedTaskIds.length > 0) {
            await supabase
                .from("tasks")
                .update({
                    team_calendar_sync_error: MISSING_MEMBER_CALENDAR_MESSAGE,
                })
                .eq("team_id", teamId)
                .in("id", skippedTaskIds);
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
