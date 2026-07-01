import { NextResponse } from "next/server";
import { TEAM_ID } from "@/lib/constants";
import {
    createServiceSupabaseClient,
    getServerUser,
} from "@/lib/serverSupabase";
import {
    fetchTodayGoogleCalendarEvents,
    refreshGoogleCalendarToken,
} from "@/lib/server/googleCalendar";
import {
    buildNotificationSuggestions,
    type QuestBriefingInput,
} from "@/lib/agents/notificationAgent";
import { createAgentSuggestions } from "@/lib/agents/suggestions";
import type { Accessibility, Task } from "@/lib/types";

type CalendarConnection = {
    member: string;
    email: string;
    access_token: string | null;
    refresh_token: string | null;
    expires_at: string | null;
};

function eventDateTime(value: { date?: string; dateTime?: string } | undefined) {
    if (!value) return { at: null, allDay: false };
    if (value.dateTime) return { at: value.dateTime, allDay: false };
    if (value.date) return { at: `${value.date}T00:00:00+09:00`, allDay: true };
    return { at: null, allDay: false };
}

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
        const connection = data as CalendarConnection;
        let accessToken = connection.access_token;
        const expiresAt = connection.expires_at
            ? new Date(connection.expires_at).getTime()
            : 0;

        if (!accessToken || expiresAt < Date.now() + 60_000) {
            if (!connection.refresh_token) {
                throw new Error("Calendar refresh token is missing");
            }
            const refreshed = await refreshGoogleCalendarToken(
                connection.refresh_token,
            );
            accessToken = refreshed.access_token;
            await serviceSupabase
                .from("agent_calendar_connections")
                .update({
                    access_token: refreshed.access_token,
                    expires_at: new Date(
                        Date.now() + refreshed.expires_in * 1000,
                    ).toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("team_id", TEAM_ID)
                .eq("email", user.email);
        }

        const events = await fetchTodayGoogleCalendarEvents(accessToken);
        const rows = events.map((event) => {
            const start = eventDateTime(event.start);
            const end = eventDateTime(event.end);
            return {
                team_id: TEAM_ID,
                member: connection.member,
                email: connection.email,
                google_event_id: event.id,
                calendar_id: "primary",
                title: event.summary || "(제목 없음)",
                starts_at: start.at,
                ends_at: end.at,
                all_day: start.allDay,
                location: event.location ?? null,
                html_link: event.htmlLink ?? null,
                synced_at: new Date().toISOString(),
            };
        });

        if (rows.length > 0) {
            const { error: upsertError } = await serviceSupabase
                .from("agent_calendar_events")
                .upsert(rows, {
                    onConflict: "team_id,email,calendar_id,google_event_id",
                });
            if (upsertError) throw upsertError;
        }

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

        const { data: quests, error: questError } =
            await serviceSupabase
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
                id: row.google_event_id,
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
