import { NextResponse, type NextRequest } from "next/server";
import { TEAM_ID } from "@/lib/constants";
import { getServerUserRole } from "@/lib/serverSupabase";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_MORNING_SEND_TIME = "08:30";

async function getCurrentPlayer(
    supabase: Awaited<ReturnType<typeof getServerUserRole>>["supabase"],
    email: string,
) {
    const { data, error } = await supabase
        .from("players")
        .select("name")
        .eq("team_id", TEAM_ID)
        .eq("email", email)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function GET() {
    const { supabase, user, role } = await getServerUserRole(TEAM_ID);
    if (!user?.email) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const player = await getCurrentPlayer(supabase, user.email);
        if (!player?.name) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data, error } = await supabase
            .from("agent_member_notification_settings")
            .select("morning_send_time, morning_enabled")
            .eq("team_id", TEAM_ID)
            .eq("email", user.email)
            .maybeSingle();
        if (error) throw error;

        const { data: teamCalendarData, error: teamCalendarError } =
            await supabase
                .from("agent_team_calendar_settings")
                .select("calendar_id, connection_email, updated_at")
                .eq("team_id", TEAM_ID)
                .maybeSingle();
        if (teamCalendarError) throw teamCalendarError;
        const teamCalendar = teamCalendarData;

        const { data: memberCalendars, error: memberCalendarError } =
            await supabase
                .from("agent_member_calendar_settings")
                .select("member, calendar_id, updated_at")
                .eq("team_id", TEAM_ID)
                .order("member", { ascending: true });
        if (memberCalendarError) throw memberCalendarError;

        return NextResponse.json({
            settings: data ?? {
                morning_send_time: `${DEFAULT_MORNING_SEND_TIME}:00`,
                morning_enabled: true,
            },
            teamCalendar,
            memberCalendars: memberCalendars ?? [],
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to load settings";
        return NextResponse.json({ message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const { supabase, user, role } = await getServerUserRole(TEAM_ID);
    if (!user?.email) {
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
        const player = await getCurrentPlayer(supabase, user.email);
        if (!player?.name) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data, error } = await supabase
            .from("agent_member_notification_settings")
            .upsert(
                {
                    team_id: TEAM_ID,
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
            if (role !== "admin") {
                return NextResponse.json(
                    { message: "Only admins can save team calendar settings" },
                    { status: 403 },
                );
            }
            if (teamCalendarId.length === 0) {
                const { error: deleteError } = await supabase
                    .from("agent_team_calendar_settings")
                    .delete()
                    .eq("team_id", TEAM_ID);
                if (deleteError) throw deleteError;
            } else {
                const { data: savedTeamCalendar, error: teamCalendarError } =
                    await supabase
                        .from("agent_team_calendar_settings")
                        .upsert(
                            {
                                team_id: TEAM_ID,
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
            if (role !== "admin") {
                return NextResponse.json(
                    { message: "Only admins can save member calendar settings" },
                    { status: 403 },
                );
            }

            const entries = Object.entries(body.memberCalendarIds).map(
                ([member, calendarId]) => ({
                    member,
                    calendarId: calendarId.trim(),
                }),
            );
            const emptyMembers = entries
                .filter((entry) => entry.calendarId.length === 0)
                .map((entry) => entry.member);
            if (emptyMembers.length > 0) {
                const { error: deleteError } = await supabase
                    .from("agent_member_calendar_settings")
                    .delete()
                    .eq("team_id", TEAM_ID)
                    .in("member", emptyMembers);
                if (deleteError) throw deleteError;
            }

            const rows = entries
                .filter((entry) => entry.calendarId.length > 0)
                .map((entry) => ({
                    team_id: TEAM_ID,
                    member: entry.member,
                    calendar_id: entry.calendarId,
                    updated_at: new Date().toISOString(),
                }));
            if (rows.length > 0) {
                const { error: upsertError } = await supabase
                    .from("agent_member_calendar_settings")
                    .upsert(rows, { onConflict: "team_id,member" });
                if (upsertError) throw upsertError;
            }

            const { data: savedMemberCalendars, error: memberCalendarError } =
                await supabase
                    .from("agent_member_calendar_settings")
                    .select("member, calendar_id, updated_at")
                    .eq("team_id", TEAM_ID)
                    .order("member", { ascending: true });
            if (memberCalendarError) throw memberCalendarError;
            memberCalendars = savedMemberCalendars ?? [];
        }

        return NextResponse.json({ settings: data, teamCalendar, memberCalendars });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to save settings";
        return NextResponse.json({ message }, { status: 500 });
    }
}
