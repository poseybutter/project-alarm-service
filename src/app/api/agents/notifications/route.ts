import { NextResponse, type NextRequest } from "next/server";
import { TEAM_ID } from "@/lib/constants";
import { buildAccessibilityReminderSuggestions } from "@/lib/agents/accessibilityReminderAgent";
import { buildNotificationSuggestions } from "@/lib/agents/notificationAgent";
import {
    listRecentlyDeliveredDedupeKeys,
} from "@/lib/agents/notificationDeliveries";
import { createAgentSuggestions } from "@/lib/agents/suggestions";
import { getServerUserRole } from "@/lib/serverSupabase";
import type { Accessibility, Task } from "@/lib/types";
import type {
    CalendarEventInput,
    QuestBriefingInput,
} from "@/lib/agents/notificationAgent";

function excludeRecentlyDelivered<T extends { dedupe_key: string | null }>(
    suggestions: T[],
    deliveredKeys: Set<string>,
) {
    return suggestions.filter(
        (suggestion) =>
            !suggestion.dedupe_key || !deliveredKeys.has(suggestion.dedupe_key),
    );
}

export async function POST(req: NextRequest) {
    const { supabase, user, role } = await getServerUserRole(TEAM_ID);
    if (!user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (role !== "admin") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const save = req.nextUrl.searchParams.get("save") !== "false";

    const [
        { data: tasks, error: taskError },
        { data: accessibility, error: accError },
        { data: calendarEvents, error: calendarError },
        { data: quests, error: questError },
    ] =
        await Promise.all([
            supabase
                .from("tasks")
                .select("*")
                .eq("team_id", TEAM_ID)
                .order("end_date", { ascending: true }),
            supabase
                .from("accessibility")
                .select("*")
                .eq("team_id", TEAM_ID)
                .order("end_date", { ascending: true }),
            supabase
                .from("agent_calendar_events")
                .select(
                    "id, member, email, title, starts_at, ends_at, all_day, location, html_link",
                )
                .eq("team_id", TEAM_ID)
                .order("starts_at", { ascending: true }),
            supabase
                .from("quests")
                .select("id, member, content, proj, end_date, task_id, status")
                .eq("team_id", TEAM_ID)
                .is("task_id", null)
                .order("order_index", { ascending: true, nullsFirst: false })
                .order("created_at", { ascending: true }),
        ]);

    if (taskError || accError || calendarError || questError) {
        return NextResponse.json(
            {
                message:
                    taskError?.message ??
                    accError?.message ??
                    calendarError?.message ??
                    questError?.message ??
                    "Failed to load notification inputs",
            },
            { status: 500 },
        );
    }

    let deliveredKeys: Set<string>;
    try {
        deliveredKeys = await listRecentlyDeliveredDedupeKeys(supabase, {
            teamId: TEAM_ID,
        });
    } catch (err) {
        const message =
            err instanceof Error
                ? err.message
                : "Failed to load notification delivery history";
        return NextResponse.json({ message }, { status: 500 });
    }

    const suggestions = excludeRecentlyDelivered(
        [
            ...buildNotificationSuggestions({
                tasks: (tasks ?? []) as Task[],
                accessibility: (accessibility ?? []) as Accessibility[],
                calendarEvents: (calendarEvents ?? []) as CalendarEventInput[],
                quests: (quests ?? []) as QuestBriefingInput[],
                createdBy: user.email ?? null,
            }),
            ...buildAccessibilityReminderSuggestions({
                accessibility: (accessibility ?? []) as Accessibility[],
                createdBy: user.email ?? null,
            }),
        ],
        deliveredKeys,
    );

    if (!save) {
        return NextResponse.json({ suggestions, saved: false });
    }

    try {
        const created = await createAgentSuggestions(supabase, suggestions);
        return NextResponse.json({ suggestions: created, saved: true });
    } catch (err) {
        const message =
            err instanceof Error
                ? err.message
                : "Failed to save notification suggestions";
        return NextResponse.json({ message }, { status: 500 });
    }
}
