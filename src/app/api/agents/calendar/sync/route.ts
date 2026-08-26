import { NextResponse } from "next/server";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import {
    syncTodayGoogleCalendarEvents,
    syncTodayTeamCalendarEvents,
    type GoogleCalendarConnection,
} from "@/infrastructure/google-calendar";
import {
    buildNotificationSuggestions,
    type QuestBriefingInput,
} from "@/features/agents/server/notificationAgent";
import { createAgentSuggestions } from "@/features/agents/server/suggestions";
import type { Accessibility, Task } from "@/shared/types";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import {
    consumeRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/shared/server/rateLimit";

export async function POST(request: Request) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const rate = consumeRateLimit(
        requestRateLimitKey(request, "calendar-sync", user.email),
        { limit: 10, windowMs: 5 * 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    const serviceSupabase = createServiceSupabaseClient();
    const { data, error } = await serviceSupabase
        .from("agent_calendar_connections")
        .select("member, email, access_token, refresh_token, expires_at")
        .eq("team_id", teamId)
        .eq("email", user.email)
        .maybeSingle();

    if (error) {
        return internalErrorResponse(
            "google-calendar-sync-load",
            error,
            "캘린더 연결 정보를 불러오지 못했습니다.",
        );
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
            teamId,
            connection,
        });
        const teamRows = role === "admin"
            ? await syncTodayTeamCalendarEvents(serviceSupabase, { teamId })
            : [];

        const { data: tasks, error: taskError } = await serviceSupabase
            .from("tasks")
            .select("*")
            .eq("team_id", teamId)
            .eq("member", connection.member);
        if (taskError) throw taskError;

        const { data: accessibility, error: accError } = await serviceSupabase
            .from("accessibility")
            .select("*")
            .eq("team_id", teamId)
            .eq("member", connection.member)
            .order("end_date", { ascending: true });
        if (accError) throw accError;

        const { data: quests, error: questError } = await serviceSupabase
            .from("quests")
            .select("id, member, content, proj, end_date, task_id, status")
            .eq("team_id", teamId)
            .eq("member", connection.member)
            .is("task_id", null)
            .order("order_index", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true });
        if (questError) throw questError;

        const suggestions = buildNotificationSuggestions({
            teamId,
            tasks: (tasks ?? []) as Task[],
            accessibility: (accessibility ?? []) as Accessibility[],
            calendarEvents: [...rows, ...teamRows].map((row) => ({
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
            events: [...rows, ...teamRows],
            count: rows.length + teamRows.length,
            personalCount: rows.length,
            teamCount: teamRows.length,
            suggestions: createdSuggestions,
            suggestionCount: createdSuggestions.length,
        });
    } catch (error) {
        return internalErrorResponse(
            "google-calendar-sync",
            error,
            "캘린더를 동기화하지 못했습니다.",
        );
    }
}
