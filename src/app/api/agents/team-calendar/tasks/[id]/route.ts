import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import {
    deleteTeamCalendarTaskEvent,
    getTeamCalendarAccessToken,
    type GoogleCalendarConnection,
    type TeamCalendarTaskInput,
    TeamCalendarPartialSyncError,
    TeamCalendarSyncError,
    syncTeamCalendarTaskEvents,
} from "@/infrastructure/google-calendar";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import {
    consumeSharedRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/shared/server/rateLimit";
import { resolveTeamMember } from "@/features/identity/server/identityRepository";

type RouteContext = {
    params: Promise<{ id: string }>;
};

function canManageTask(params: {
    role: string | null;
    playerName?: string | null;
    taskMember?: string | null;
}) {
    return (
        params.role === "admin" ||
        Boolean(params.playerName && params.playerName === params.taskMember)
    );
}

async function loadTeamCalendarContext(
    supabase: ReturnType<typeof createServiceSupabaseClient>,
    teamId: string,
    member?: string | null,
    existingCalendarId?: string | null,
) {
    const { data: setting, error: settingError } = await supabase
        .from("agent_team_calendar_settings")
        .select("calendar_id, connection_email")
        .eq("team_id", teamId)
        .maybeSingle();
    if (settingError) throw settingError;
    if (!setting?.calendar_id || !setting.connection_email) {
        throw new TeamCalendarSyncError("팀 캘린더 ID가 설정되어 있지 않습니다");
    }

    let calendarId = existingCalendarId || null;
    if (!calendarId && member) {
        const { data: memberCalendar, error: memberCalendarError } =
            await supabase
                .from("agent_member_calendar_settings")
                .select("calendar_id")
                .eq("team_id", teamId)
                .eq("member", member)
                .maybeSingle();
        if (memberCalendarError) throw memberCalendarError;
        calendarId = memberCalendar?.calendar_id ?? null;
    }
    if (!calendarId) {
        throw new TeamCalendarSyncError(
            "담당자별 캘린더 ID가 설정되어 있지 않습니다",
        );
    }

    const { data: connection, error: connectionError } = await supabase
        .from("agent_calendar_connections")
        .select("member, email, access_token, refresh_token, expires_at")
        .eq("team_id", teamId)
        .eq("email", setting.connection_email)
        .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) {
        throw new TeamCalendarSyncError(
            "팀 캘린더 연결 계정을 찾을 수 없습니다",
        );
    }

    const accessToken = await getTeamCalendarAccessToken(
        supabase,
        teamId,
        connection as GoogleCalendarConnection,
    );

    return {
        calendarId,
        sharedCalendarId: setting.calendar_id as string,
        accessToken,
    };
}

async function loadTask(
    supabase: ReturnType<typeof createServiceSupabaseClient>,
    id: number,
) {
    const { data, error } = await supabase
        .from("tasks")
        .select(
            "id, team_id, member, proj, content, content_items, status, start_date, end_date, show_on_team_calendar, team_calendar_event_id, team_calendar_item_event_ids, team_calendar_id",
        )
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    return data as (TeamCalendarTaskInput & { team_id: string }) | null;
}

export async function POST(_req: NextRequest, context: RouteContext) {
    const { id: rawId } = await context.params;
    const taskId = Number(rawId);
    if (!Number.isFinite(taskId)) {
        return NextResponse.json({ message: "Invalid task id" }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    let authorizedTeamId: string | null = null;

    try {
        const task = await loadTask(supabase, taskId);
        if (!task) {
            return NextResponse.json({ message: "Task not found" }, { status: 404 });
        }
        const { user, role } = await getServerUserRole(task.team_id);
        if (!user?.email || !role) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }
        // 업무 저장마다 Google API 동기화가 돌므로 남용을 막는다 (저장·삭제 합산).
        const rate = await consumeSharedRateLimit(
            requestRateLimitKey(_req, "team-calendar-task-sync", user.email),
            { limit: 60, windowMs: 60 * 1000 },
        );
        if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
        authorizedTeamId = task.team_id;
        const member = await resolveTeamMember(supabase, user.email, task.team_id);
        if (
            !canManageTask({
                role,
                playerName: member?.name,
                taskMember: task.member,
            })
        ) {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }

        const { calendarId, sharedCalendarId, accessToken } = await loadTeamCalendarContext(
            supabase,
            task.team_id,
            task.member,
            task.team_calendar_id,
        );
        // 항목 일정만 있는 업무는 base ID가 null 이므로, 항목 ID까지 함께 봐야
        // 캘린더가 바뀔 때 이전 캘린더의 일정이 남지 않는다.
        const previousEventIds = [
            task.team_calendar_event_id,
            ...(task.team_calendar_item_event_ids ?? []),
        ].filter((id): id is string => Boolean(id));
        const previousCalendarId =
            previousEventIds.length > 0 &&
            (!task.team_calendar_id || task.team_calendar_id !== calendarId)
                ? task.team_calendar_id || sharedCalendarId
                : null;
        const synced = await syncTeamCalendarTaskEvents({
            accessToken,
            calendarId,
            // 캘린더가 바뀌었으면 이전 이벤트 ID는 새 캘린더에서 쓸 수 없다.
            task: previousCalendarId
                ? {
                      ...task,
                      team_calendar_event_id: null,
                      team_calendar_item_event_ids: null,
                  }
                : task,
        });

        const { error } = await supabase
            .from("tasks")
            .update({
                show_on_team_calendar: true,
                team_calendar_event_id: synced.baseEventId,
                team_calendar_item_event_ids: synced.itemEventIds.length
                    ? synced.itemEventIds
                    : null,
                team_calendar_id: calendarId,
                team_calendar_synced_at: new Date().toISOString(),
                team_calendar_sync_error: null,
            })
            .eq("team_id", task.team_id)
            .eq("id", taskId);
        if (error) throw error;

        // 이전 캘린더 정리는 새 일정과 DB 갱신이 모두 끝난 뒤에 한다.
        // 먼저 지우면 동기화가 실패했을 때 지워진 ID 만 DB 에 남는다.
        if (previousCalendarId) {
            for (const staleId of previousEventIds) {
                await deleteTeamCalendarTaskEvent({
                    accessToken,
                    calendarId: previousCalendarId,
                    eventId: staleId,
                });
            }
        }

        return NextResponse.json({
            synced: true,
            eventId: synced.baseEventId,
            itemEventIds: synced.itemEventIds,
            htmlLink: synced.htmlLink,
        });
    } catch (error) {
        // 설정 누락·기간 누락처럼 사용자가 고칠 수 있는 사유는 그대로 알려준다.
        const actionable = error instanceof TeamCalendarSyncError;
        const message = actionable
            ? error.message
            : "팀 캘린더 동기화에 실패했습니다.";
        if (authorizedTeamId) {
            // 중간까지 만들어진 이벤트 ID 를 저장해야 다음 시도에서 재사용하고,
            // 저장하지 않으면 그 일정이 캘린더에 고아로 남는다.
            const progress =
                error instanceof TeamCalendarPartialSyncError
                    ? {
                          team_calendar_event_id: error.progress.baseEventId,
                          team_calendar_item_event_ids: error.progress
                              .itemEventIds.length
                              ? error.progress.itemEventIds
                              : null,
                      }
                    : {};
            await supabase
                .from("tasks")
                .update({ ...progress, team_calendar_sync_error: message })
                .eq("team_id", authorizedTeamId)
                .eq("id", taskId);
        }
        if (actionable) {
            return NextResponse.json({ message }, { status: 409 });
        }
        return internalErrorResponse(
            "team-calendar-task-sync",
            error,
            message,
        );
    }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
    const { id: rawId } = await context.params;
    const taskId = Number(rawId);
    if (!Number.isFinite(taskId)) {
        return NextResponse.json({ message: "Invalid task id" }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();

    try {
        const task = await loadTask(supabase, taskId);
        if (!task) return NextResponse.json({ deleted: false });
        const { user, role } = await getServerUserRole(task.team_id);
        if (!user?.email || !role) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }
        const rate = await consumeSharedRateLimit(
            requestRateLimitKey(_req, "team-calendar-task-sync", user.email),
            { limit: 60, windowMs: 60 * 1000 },
        );
        if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
        const member = await resolveTeamMember(supabase, user.email, task.team_id);
        if (
            !canManageTask({
                role,
                playerName: member?.name,
                taskMember: task.member,
            })
        ) {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }

        const eventIds = [
            task.team_calendar_event_id,
            ...(task.team_calendar_item_event_ids ?? []),
        ].filter((id): id is string => Boolean(id));
        if (eventIds.length > 0) {
            const { calendarId, accessToken } =
                await loadTeamCalendarContext(
                    supabase,
                    task.team_id,
                    task.member,
                    task.team_calendar_id,
                );
            for (const eventId of eventIds) {
                await deleteTeamCalendarTaskEvent({
                    accessToken,
                    calendarId,
                    eventId,
                });
            }
            // 삭제된 일정 식별자를 남겨두면 이후 동기화가 없는 일정을 가리키게 된다.
            // 읽어온 event_id 를 조건에 포함해, 그사이 재동기화로 새 일정이 생겼다면 건드리지 않는다.
            // 읽어온 ID 스냅샷과 정확히 일치할 때만 지운다.
            // 그사이 재동기화가 새 일정을 만들었다면 건드리지 않는다.
            // 항목 일정만 있는 업무는 base ID 가 null 이라, 두 컬럼을 모두 봐야 한다.
            let cleanup = supabase
                .from("tasks")
                .update({
                    team_calendar_event_id: null,
                    team_calendar_item_event_ids: null,
                    team_calendar_synced_at: null,
                    team_calendar_sync_error: null,
                })
                .eq("team_id", task.team_id)
                .eq("id", taskId);
            cleanup = task.team_calendar_event_id
                ? cleanup.eq(
                      "team_calendar_event_id",
                      task.team_calendar_event_id,
                  )
                : cleanup.is("team_calendar_event_id", null);
            cleanup = task.team_calendar_item_event_ids?.length
                ? cleanup.filter(
                      "team_calendar_item_event_ids",
                      "eq",
                      JSON.stringify(task.team_calendar_item_event_ids),
                  )
                : cleanup.is("team_calendar_item_event_ids", null);
            const { error } = await cleanup;
            if (error) throw error;
        }

        return NextResponse.json({ deleted: true });
    } catch (error) {
        if (error instanceof TeamCalendarSyncError) {
            return NextResponse.json(
                { message: error.message },
                { status: 409 },
            );
        }
        return internalErrorResponse(
            "team-calendar-task-delete",
            error,
            "팀 캘린더 일정을 삭제하지 못했습니다.",
        );
    }
}
