import { NextResponse, type NextRequest } from "next/server";
import { requireAdminSession } from "@/features/admin/server/adminRepository";
import { internalErrorResponse } from "@/lib/server/apiResponse";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/lib/serverSupabase";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_MORNING_SEND_TIME = "08:30";

async function getCurrentPlayer(
    supabase: Awaited<ReturnType<typeof getServerCurrentTeamRole>>["supabase"],
    email: string,
    teamId: string,
) {
    const { data, error } = await supabase
        .from("players")
        .select("name")
        .eq("team_id", teamId)
        .eq("email", email)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function GET() {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const service = createServiceSupabaseClient();
        const player = await getCurrentPlayer(service, user.email, teamId);
        if (!player?.name) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data, error } = await service
            .from("agent_member_notification_settings")
            .select("morning_send_time, morning_enabled")
            .eq("team_id", teamId)
            .eq("email", user.email)
            .maybeSingle();
        if (error) throw error;

        let teamCalendar = null;
        let memberCalendars: Array<{
            member: string;
            calendar_id: string;
            updated_at: string;
        }> = [];
        if (role === "admin") {
            await requireAdminSession(teamId, "integrations.read");
            const [teamResult, memberResult] = await Promise.all([
                service
                    .from("agent_team_calendar_settings")
                    .select("calendar_id, connection_email, updated_at")
                    .eq("team_id", teamId)
                    .maybeSingle(),
                service
                    .from("agent_member_calendar_settings")
                    .select("member, calendar_id, updated_at")
                    .eq("team_id", teamId)
                    .order("member", { ascending: true }),
            ]);
            if (teamResult.error) throw teamResult.error;
            if (memberResult.error) throw memberResult.error;
            teamCalendar = teamResult.data;
            memberCalendars = memberResult.data ?? [];
        }

        return NextResponse.json({
            settings: data ?? {
                morning_send_time: `${DEFAULT_MORNING_SEND_TIME}:00`,
                morning_enabled: true,
            },
            teamCalendar,
            memberCalendars,
        });
    } catch (error) {
        return internalErrorResponse(
            "agent-settings-get",
            error,
            "알림 설정을 불러오지 못했습니다.",
        );
    }
}

export async function PUT(req: NextRequest) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body: {
        morningSendTime?: string;
        morningEnabled?: boolean;
        teamCalendarId?: string;
        memberCalendarIds?: Record<string, string>;
    };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const morningSendTime = body.morningSendTime ?? DEFAULT_MORNING_SEND_TIME;
    if (!TIME_PATTERN.test(morningSendTime)) {
        return NextResponse.json(
            { message: "morningSendTime must be HH:mm" },
            { status: 400 },
        );
    }

    try {
        const service = createServiceSupabaseClient();
        const player = await getCurrentPlayer(service, user.email, teamId);
        if (!player?.name) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data, error } = await service
            .from("agent_member_notification_settings")
            .upsert(
                {
                    team_id: teamId,
                    member: player.name,
                    email: user.email,
                    morning_send_time: morningSendTime,
                    morning_enabled: body.morningEnabled ?? true,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "team_id,email" },
            )
            .select("morning_send_time, morning_enabled")
            .maybeSingle();

        if (error) throw error;

        let teamCalendar = null;
        const teamCalendarId = body.teamCalendarId?.trim();
        if (teamCalendarId !== undefined) {
            await requireAdminSession(teamId, "integrations.manage");
            if (teamCalendarId.length === 0) {
                const { error: deleteError } = await service
                    .from("agent_team_calendar_settings")
                    .delete()
                    .eq("team_id", teamId);
                if (deleteError) throw deleteError;
            } else {
                const { data: savedTeamCalendar, error: teamCalendarError } =
                    await service
                        .from("agent_team_calendar_settings")
                        .upsert(
                            {
                                team_id: teamId,
                                calendar_id: teamCalendarId,
                                connection_email: user.email,
                                updated_at: new Date().toISOString(),
                            },
                            { onConflict: "team_id" },
                        )
                        .select("calendar_id, connection_email, updated_at")
                        .maybeSingle();
                if (teamCalendarError) throw teamCalendarError;
                teamCalendar = savedTeamCalendar;
            }
        }

        let memberCalendars = null;
        if (body.memberCalendarIds !== undefined) {
            await requireAdminSession(teamId, "integrations.manage");

            const { data: activePlayers, error: playersError } = await service
                .from("players")
                .select("name")
                .eq("team_id", teamId)
                .eq("status", "active");
            if (playersError) throw playersError;
            const allowedMembers = new Set(
                (activePlayers ?? []).map((row) => String(row.name)),
            );

            const entries = Object.entries(body.memberCalendarIds).map(
                ([member, calendarId]) => ({
                    member: member.trim(),
                    calendarId: calendarId.trim(),
                }),
            );
            if (entries.some((entry) => !allowedMembers.has(entry.member))) {
                return NextResponse.json(
                    { message: "팀에 속하지 않은 구성원이 포함되어 있습니다." },
                    { status: 400 },
                );
            }
            const emptyMembers = entries
                .filter((entry) => entry.calendarId.length === 0)
                .map((entry) => entry.member);
            if (emptyMembers.length > 0) {
                const { error: deleteError } = await service
                    .from("agent_member_calendar_settings")
                    .delete()
                    .eq("team_id", teamId)
                    .in("member", emptyMembers);
                if (deleteError) throw deleteError;
            }

            const rows = entries
                .filter((entry) => entry.calendarId.length > 0)
                .map((entry) => ({
                    team_id: teamId,
                    member: entry.member,
                    calendar_id: entry.calendarId,
                    updated_at: new Date().toISOString(),
                }));
            if (rows.length > 0) {
                const { error: upsertError } = await service
                    .from("agent_member_calendar_settings")
                    .upsert(rows, { onConflict: "team_id,member" });
                if (upsertError) throw upsertError;
            }

            const { data: savedMemberCalendars, error: memberCalendarError } =
                await service
                    .from("agent_member_calendar_settings")
                    .select("member, calendar_id, updated_at")
                    .eq("team_id", teamId)
                    .order("member", { ascending: true });
            if (memberCalendarError) throw memberCalendarError;
            memberCalendars = savedMemberCalendars ?? [];
        }

        return NextResponse.json({ settings: data, teamCalendar, memberCalendars });
    } catch (error) {
        return internalErrorResponse(
            "agent-settings-put",
            error,
            "알림 설정을 저장하지 못했습니다.",
        );
    }
}
