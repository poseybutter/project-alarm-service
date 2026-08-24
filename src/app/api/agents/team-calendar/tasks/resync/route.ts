import { NextResponse } from "next/server";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/lib/serverSupabase";
import {
    deleteTeamCalendarTaskEvent,
    getTeamCalendarAccessToken,
    type GoogleCalendarConnection,
    type TeamCalendarTaskInput,
    upsertTeamCalendarTaskEvent,
} from "@/lib/server/googleCalendar";

export async function POST() {
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

        const { data: tasks, error: taskError } = await supabase
            .from("tasks")
            .select(
                "id, member, proj, content, status, start_date, end_date, show_on_team_calendar, team_calendar_event_id, team_calendar_id",
            )
            .eq("team_id", teamId);
        if (taskError) throw taskError;

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
                const previousCalendarId =
                    task.team_calendar_event_id &&
                    (!task.team_calendar_id ||
                        task.team_calendar_id !== targetCalendarId)
                        ? task.team_calendar_id || setting.calendar_id
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
                    calendarId: targetCalendarId,
                    task: previousCalendarId
                        ? { ...task, team_calendar_event_id: null }
                        : task,
                });

                const { error: updateError } = await supabase
                    .from("tasks")
                    .update({
                        team_calendar_event_id: event.id,
                        team_calendar_id: targetCalendarId,
                        team_calendar_synced_at: new Date().toISOString(),
                        team_calendar_sync_error: null,
                    })
                    .eq("team_id", teamId)
                    .eq("id", task.id);
                if (updateError) throw updateError;
                synced += 1;
            } catch (err) {
                const message =
                    err instanceof Error
                        ? err.message
                        : "팀 캘린더 재동기화 실패";
                errors.push({ id: task.id, message });
                await supabase
                    .from("tasks")
                    .update({ team_calendar_sync_error: message })
                    .eq("team_id", teamId)
                    .eq("id", task.id);
            }
        }

        return NextResponse.json({
            synced,
            skipped,
            failed: errors.length,
            errors,
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "팀 캘린더 재동기화 실패";
        return NextResponse.json({ message }, { status: 500 });
    }
}
