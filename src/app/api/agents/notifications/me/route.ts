import { NextResponse } from "next/server";
import { TEAM_ID } from "@/lib/constants";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/lib/serverSupabase";
import {
    buildNotificationSuggestions,
    type CalendarEventInput,
    type QuestBriefingInput,
} from "@/lib/agents/notificationAgent";
import {
    syncTodayGoogleCalendarEvents,
    syncTodayTeamCalendarEvents,
    type GoogleCalendarConnection,
} from "@/lib/server/googleCalendar";
import type { Accessibility, Task } from "@/lib/types";

export async function POST() {
    const { supabase, user } = await getServerUserRole(TEAM_ID);
    if (!user?.email) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const serviceSupabase = createServiceSupabaseClient();
        const { data: player, error: playerError } = await supabase
            .from("players")
            .select("name")
            .eq("team_id", TEAM_ID)
            .eq("email", user.email)
            .maybeSingle();
        if (playerError) throw playerError;
        if (!player?.name) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data: calendarConnection, error: connectionError } =
            await serviceSupabase
                .from("agent_calendar_connections")
                .select("member, email, access_token, refresh_token, expires_at")
                .eq("team_id", TEAM_ID)
                .eq("email", user.email)
                .maybeSingle();
        if (connectionError) throw connectionError;

        const personalCalendarEvents = calendarConnection
            ? await syncTodayGoogleCalendarEvents(serviceSupabase, {
                  teamId: TEAM_ID,
                  connection: calendarConnection as GoogleCalendarConnection,
              })
            : [];
        const teamCalendarEvents = await syncTodayTeamCalendarEvents(
            serviceSupabase,
            { teamId: TEAM_ID },
        );

        const [
            { data: tasks, error: taskError },
            { data: accessibility, error: accError },
            { data: quests, error: questError },
        ] = await Promise.all([
            serviceSupabase
                .from("tasks")
                .select("*")
                .eq("team_id", TEAM_ID)
                .eq("member", player.name),
            serviceSupabase
                .from("accessibility")
                .select("*")
                .eq("team_id", TEAM_ID)
                .eq("member", player.name)
                .order("end_date", { ascending: true }),
            serviceSupabase
                .from("quests")
                .select("id, member, content, proj, end_date, task_id, status")
                .eq("team_id", TEAM_ID)
                .eq("member", player.name)
                .is("task_id", null)
                .order("order_index", { ascending: true, nullsFirst: false })
                .order("created_at", { ascending: true }),
        ]);

        if (taskError || accError || questError) {
            throw taskError ?? accError ?? questError;
        }

        const suggestions = buildNotificationSuggestions({
            tasks: (tasks ?? []) as Task[],
            accessibility: (accessibility ?? []) as Accessibility[],
            calendarEvents: [
                ...(personalCalendarEvents ?? []),
                ...(teamCalendarEvents ?? []),
            ] as CalendarEventInput[],
            quests: (quests ?? []) as QuestBriefingInput[],
            createdBy: user.email,
        });

        const rows = suggestions.map((suggestion) => ({
            ...suggestion,
            status: "pending",
            reviewed_by: null,
            reviewed_at: null,
        }));

        if (rows.length === 0) {
            await serviceSupabase
                .from("agent_suggestions")
                .update({
                    status: "dismissed",
                    reviewed_by: user.email,
                    reviewed_at: new Date().toISOString(),
                })
                .eq("team_id", TEAM_ID)
                .eq("agent_type", "notification")
                .eq("status", "pending")
                .eq("payload->>recipientMember", player.name);

            return NextResponse.json({ suggestions: [] });
        }

        const { data: refreshed, error: refreshError } = await serviceSupabase
            .from("agent_suggestions")
            .upsert(rows, { onConflict: "team_id,dedupe_key" })
            .select("*");
        if (refreshError) throw refreshError;

        const refreshedIds = (refreshed ?? []).map((row) => row.id);
        let cleanup = serviceSupabase
            .from("agent_suggestions")
            .update({
                status: "dismissed",
                reviewed_by: user.email,
                reviewed_at: new Date().toISOString(),
            })
            .eq("team_id", TEAM_ID)
            .eq("agent_type", "notification")
            .eq("status", "pending")
            .eq("payload->>recipientMember", player.name);

        if (refreshedIds.length > 0) {
            cleanup = cleanup.not("id", "in", `(${refreshedIds.join(",")})`);
        }

        const { error: cleanupError } = await cleanup;
        if (cleanupError) throw cleanupError;

        return NextResponse.json({ suggestions: refreshed ?? [] });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to refresh briefing";
        return NextResponse.json({ message }, { status: 500 });
    }
}
