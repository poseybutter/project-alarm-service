import { NextResponse } from "next/server";
import { TEAM_ID } from "@/lib/constants";
import {
    createServiceSupabaseClient,
    getServerUser,
} from "@/lib/serverSupabase";
import {
    syncTodayGoogleCalendarEvents,
    type GoogleCalendarConnection,
} from "@/lib/server/googleCalendar";
import {
    buildNotificationSuggestions,
    type QuestBriefingInput,
} from "@/lib/agents/notificationAgent";
import { createAgentSuggestions } from "@/lib/agents/suggestions";
import type { Accessibility, Task } from "@/lib/types";

export async function POST() {
    const { user } = await getServerUser();
    if (!user?.email) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const serviceSupabase = createServiceSupabaseClient();
    const { data, error } = await serviceSupabase
        .from("agent_calendar_connections")
        .select("member, email, access_token, refresh_token, expires_at")
        .eq("team_id", TEAM_ID)
        .eq("email", user.email)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json(
            { message: "Calendar is not connected" },
            { status: 404 },
        );
    }

    try {
        const connection = data as GoogleCalendarConnection;
        const rows = await syncTodayGoogleCalendarEvents(serviceSupabase, {
            teamId: TEAM_ID,
            connection,
        });

        const { data: tasks, error: taskError } = await serviceSupabase
            .from("tasks")
            .select("*")
            .eq("team_id", TEAM_ID)
            .eq("member", connection.member);
        if (taskError) throw taskError;

        const { data: accessibility, error: accError } = await serviceSupabase
            .from("accessibility")
            .select("*")
            .eq("team_id", TEAM_ID)
            .eq("member", connection.member)
            .order("end_date", { ascending: true });
        if (accError) throw accError;

        const { data: quests, error: questError } = await serviceSupabase
            .from("quests")
            .select("id, member, content, proj, end_date, task_id, status")
            .eq("team_id", TEAM_ID)
            .eq("member", connection.member)
            .is("task_id", null)
            .order("order_index", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true });
        if (questError) throw questError;

        const suggestions = buildNotificationSuggestions({
            tasks: (tasks ?? []) as Task[],
            accessibility: (accessibility ?? []) as Accessibility[],
            calendarEvents: rows.map((row) => ({
                id: row.id ?? 0,
                member: row.member,
                email: row.email,
                title: row.title,
                starts_at: row.starts_at,
                ends_at: row.ends_at,
                all_day: row.all_day,
                location: row.location,
                html_link: row.html_link,
            })),
            quests: (quests ?? []) as QuestBriefingInput[],
            createdBy: user.email,
        });
        const createdSuggestions = await createAgentSuggestions(
            serviceSupabase,
            suggestions,
        );

        return NextResponse.json({
            events: rows,
            count: rows.length,
            suggestions: createdSuggestions,
            suggestionCount: createdSuggestions.length,
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to sync calendar";
        return NextResponse.json({ message }, { status: 500 });
    }
}
