import { NextResponse, type NextRequest } from "next/server";
import { buildAccessibilityReminderSuggestions } from "@/features/agents/server/accessibilityReminderAgent";
import { buildNotificationSuggestions } from "@/features/agents/server/notificationAgent";
import {
    listRecentlyDeliveredDedupeKeys,
} from "@/features/agents/server/notificationDeliveries";
import { createAgentSuggestions } from "@/features/agents/server/suggestions";
import { internalErrorResponse } from "@/lib/server/apiResponse";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/lib/serverSupabase";
import type { Accessibility, Task } from "@/lib/types";
import type {
    CalendarEventInput,
    QuestBriefingInput,
} from "@/features/agents/server/notificationAgent";

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
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (role !== "admin") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const save = req.nextUrl.searchParams.get("save") !== "false";
    const service = createServiceSupabaseClient();

    const [
        { data: tasks, error: taskError },
        { data: accessibility, error: accError },
        { data: calendarEvents, error: calendarError },
        { data: quests, error: questError },
    ] =
        await Promise.all([
            service
                .from("tasks")
                .select("*")
                .eq("team_id", teamId)
                .order("end_date", { ascending: true }),
            service
                .from("accessibility")
                .select("*")
                .eq("team_id", teamId)
                .order("end_date", { ascending: true }),
            service
                .from("agent_calendar_events")
                .select(
                    "id, member, email, title, starts_at, ends_at, all_day, location, html_link",
                )
                .eq("team_id", teamId)
                .order("starts_at", { ascending: true }),
            service
                .from("quests")
                .select("id, member, content, proj, end_date, task_id, status")
                .eq("team_id", teamId)
                .is("task_id", null)
                .order("order_index", { ascending: true, nullsFirst: false })
                .order("created_at", { ascending: true }),
        ]);

    if (taskError || accError || calendarError || questError) {
        return internalErrorResponse(
            "agent-notifications-inputs",
            taskError ?? accError ?? calendarError ?? questError,
            "알림 생성에 필요한 정보를 불러오지 못했습니다.",
        );
    }

    let deliveredKeys: Set<string>;
    try {
        deliveredKeys = await listRecentlyDeliveredDedupeKeys(service, {
            teamId,
        });
    } catch (error) {
        return internalErrorResponse(
            "agent-notifications-history",
            error,
            "알림 발송 이력을 확인하지 못했습니다.",
        );
    }

    const suggestions = excludeRecentlyDelivered(
        [
            ...buildNotificationSuggestions({
                teamId,
                tasks: (tasks ?? []) as Task[],
                accessibility: (accessibility ?? []) as Accessibility[],
                calendarEvents: (calendarEvents ?? []) as CalendarEventInput[],
                quests: (quests ?? []) as QuestBriefingInput[],
                createdBy: user.email ?? null,
            }),
            ...buildAccessibilityReminderSuggestions({
                teamId,
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
        const created = await createAgentSuggestions(service, suggestions);
        return NextResponse.json({ suggestions: created, saved: true });
    } catch (error) {
        return internalErrorResponse(
            "agent-notifications-save",
            error,
            "알림 제안을 저장하지 못했습니다.",
        );
    }
}
