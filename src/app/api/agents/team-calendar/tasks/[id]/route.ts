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
    upsertTeamCalendarTaskEvent,
} from "@/infrastructure/google-calendar";
import { internalErrorResponse } from "@/shared/server/apiResponse";
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
        throw new Error("팀 캘린더 ID가 설정되어 있지 않습니다");
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
        throw new Error("담당자별 캘린더 ID가 설정되어 있지 않습니다");
    }

    const { data: connection, error: connectionError } = await supabase
        .from("agent_calendar_connections")
        .select("member, email, access_token, refresh_token, expires_at")
        .eq("team_id", teamId)
        .eq("email", setting.connection_email)
        .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) {
        throw new Error("팀 캘린더 연결 계정을 찾을 수 없습니다");
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
            "id, team_id, member, proj, content, status, start_date, end_date, show_on_team_calendar, team_calendar_event_id, team_calendar_id",
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
        const previousCalendarId =
            task.team_calendar_event_id &&
            (!task.team_calendar_id || task.team_calendar_id !== calendarId)
                ? task.team_calendar_id || sharedCalendarId
                : null;
        if (previousCalendarId) {
            await deleteTeamCalendarTaskEvent({
                accessToken,
                calendarId: previousCalendarId,
                eventId: task.team_calendar_event_id as string,
            });
        }
        const event = await upsertTeamCalendarTaskEvent({
            accessToken,
            calendarId,
            task: previousCalendarId
                ? { ...task, team_calendar_event_id: null }
                : task,
        });

        const { error } = await supabase
            .from("tasks")
            .update({
                show_on_team_calendar: true,
                team_calendar_event_id: event.id,
                team_calendar_id: calendarId,
                team_calendar_synced_at: new Date().toISOString(),
                team_calendar_sync_error: null,
            })
            .eq("team_id", task.team_id)
            .eq("id", taskId);
        if (error) throw error;

        return NextResponse.json({
            synced: true,
            eventId: event.id,
            htmlLink: event.htmlLink ?? null,
        });
    } catch (error) {
        const message = "팀 캘린더 동기화에 실패했습니다.";
        if (authorizedTeamId) {
            await supabase
                .from("tasks")
                .update({ team_calendar_sync_error: message })
                .eq("team_id", authorizedTeamId)
                .eq("id", taskId);
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

        if (task.team_calendar_event_id) {
            const { calendarId, accessToken } =
                await loadTeamCalendarContext(
                    supabase,
                    task.team_id,
                    task.member,
                    task.team_calendar_id,
                );
            await deleteTeamCalendarTaskEvent({
                accessToken,
                calendarId,
                eventId: task.team_calendar_event_id,
            });
        }

        return NextResponse.json({ deleted: true });
    } catch (error) {
        return internalErrorResponse(
            "team-calendar-task-delete",
            error,
            "팀 캘린더 일정을 삭제하지 못했습니다.",
        );
    }
}
