import { NextResponse } from "next/server";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/lib/serverSupabase";
import {
    buildNotificationSuggestions,
    type CalendarEventInput,
    type QuestBriefingInput,
} from "@/lib/agents/notificationAgent";
import { sendGoogleChatMessage } from "@/infrastructure/google-chat";
import { syncTodayTeamCalendarEvents } from "@/infrastructure/google-calendar";
import type {
    AgentSuggestion,
    NotificationSuggestionPayload,
} from "@/lib/agents/types";
import type { Accessibility, Task } from "@/lib/types";
import { internalErrorResponse } from "@/lib/server/apiResponse";
import { decryptIntegrationToken } from "@/infrastructure/security/tokenEncryption";
import {
    consumeRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/lib/server/rateLimit";

function isNotificationPayload(
    payload: Record<string, unknown>,
): payload is NotificationSuggestionPayload {
    return typeof payload.text === "string" && payload.text.trim().length > 0;
}

function todayKstYmd(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}

async function buildFreshSuggestion(
    supabase: ReturnType<typeof createServiceSupabaseClient>,
    params: {
        member: string;
        email: string;
        teamId: string;
        canSyncTeamCalendar: boolean;
    },
) {
    if (params.canSyncTeamCalendar) {
        await syncTodayTeamCalendarEvents(supabase, { teamId: params.teamId });
    }

    const [
        { data: tasks, error: taskError },
        { data: accessibility, error: accError },
        { data: calendarEvents, error: calendarError },
        { data: quests, error: questError },
    ] = await Promise.all([
        supabase
            .from("tasks")
            .select("*")
            .eq("team_id", params.teamId)
            .eq("member", params.member),
        supabase
            .from("accessibility")
            .select("*")
            .eq("team_id", params.teamId)
            .eq("member", params.member)
            .order("end_date", { ascending: true }),
        supabase
            .from("agent_calendar_events")
            .select(
                "id, member, email, title, starts_at, ends_at, all_day, location, html_link",
            )
            .eq("team_id", params.teamId)
            .eq("email", params.email)
            .order("starts_at", { ascending: true }),
        supabase
            .from("quests")
            .select("id, member, content, proj, end_date, task_id, status")
            .eq("team_id", params.teamId)
            .eq("member", params.member)
            .is("task_id", null)
            .order("order_index", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true }),
    ]);

    if (taskError || accError || calendarError || questError) {
        throw taskError ?? accError ?? calendarError ?? questError;
    }

    return buildNotificationSuggestions({
        teamId: params.teamId,
        tasks: (tasks ?? []) as Task[],
        accessibility: (accessibility ?? []) as Accessibility[],
        calendarEvents: (calendarEvents ?? []) as CalendarEventInput[],
        quests: (quests ?? []) as QuestBriefingInput[],
        createdBy: params.email,
    }).find((suggestion) => {
        const payload = suggestion.payload as { recipientMember?: unknown };
        return payload.recipientMember === params.member;
    });
}

export async function POST(request: Request) {
    const { supabase, user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const rate = consumeRateLimit(
        requestRateLimitKey(request, "briefing-test", user.email),
        { limit: 5, windowMs: 5 * 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    try {
        const serviceSupabase = createServiceSupabaseClient();
        const { data: player, error: playerError } = await supabase
            .from("players")
            .select("name")
            .eq("team_id", teamId)
            .eq("email", user.email)
            .maybeSingle();
        if (playerError) throw playerError;
        if (!player?.name) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data: webhookRow, error: webhookError } = await serviceSupabase
            .from("agent_member_webhooks")
            .select("webhook_url")
            .eq("team_id", teamId)
            .eq("email", user.email)
            .maybeSingle();
        if (webhookError) throw webhookError;
        if (!webhookRow?.webhook_url) {
            return NextResponse.json(
                { message: "개인 Google Chat webhook이 등록되어 있지 않습니다" },
                { status: 400 },
            );
        }

        const { data: existingSuggestions, error: suggestionError } =
            await serviceSupabase
                .from("agent_suggestions")
                .select("*")
                .eq("team_id", teamId)
                .eq("agent_type", "notification")
                .eq("status", "pending")
                .eq("payload->>recipientMember", player.name)
                .order("created_at", { ascending: false })
                .limit(1);
        if (suggestionError) throw suggestionError;

        let suggestion = (existingSuggestions?.[0] ??
            null) as AgentSuggestion | null;
        if (!suggestion) {
            const fresh = await buildFreshSuggestion(serviceSupabase, {
                member: player.name,
                email: user.email,
                teamId,
                canSyncTeamCalendar: role === "admin",
            });
            if (!fresh) {
                return NextResponse.json(
                    { message: "보낼 브리핑 내용이 없습니다" },
                    { status: 404 },
                );
            }
            const { data: created, error: createError } = await serviceSupabase
                .from("agent_suggestions")
                .upsert(
                    {
                        ...fresh,
                        status: "pending",
                    },
                    { onConflict: "team_id,dedupe_key" },
                )
                .select("*")
                .maybeSingle();
            if (createError) throw createError;
        }

        const fresh = await buildFreshSuggestion(serviceSupabase, {
            member: player.name,
            email: user.email,
            teamId,
            canSyncTeamCalendar: role === "admin",
        });
        if (!fresh) {
            return NextResponse.json(
                { message: "No briefing content to send" },
                { status: 404 },
            );
        }

        const { data: refreshed, error: refreshError } = await serviceSupabase
            .from("agent_suggestions")
            .upsert(
                {
                    ...fresh,
                    status: "pending",
                    reviewed_by: null,
                    reviewed_at: null,
                },
                { onConflict: "team_id,dedupe_key" },
            )
            .select("*")
            .maybeSingle();
        if (refreshError) throw refreshError;
        if (!refreshed) {
            return NextResponse.json(
                { message: "No briefing content to send" },
                { status: 404 },
            );
        }

        suggestion = refreshed as AgentSuggestion;

        const { error: staleCleanupError } = await serviceSupabase
            .from("agent_suggestions")
            .update({
                status: "dismissed",
                reviewed_by: user.email,
                reviewed_at: new Date().toISOString(),
            })
            .eq("team_id", teamId)
            .eq("agent_type", "notification")
            .eq("status", "pending")
            .eq("payload->>recipientMember", player.name)
            .like(
                "dedupe_key",
                `notification:member:${player.name}:${todayKstYmd()}:%`,
            )
            .neq("id", suggestion.id);
        if (staleCleanupError) throw staleCleanupError;

        if (!isNotificationPayload(suggestion.payload)) {
            return NextResponse.json(
                { message: "브리핑 payload가 올바르지 않습니다" },
                { status: 400 },
            );
        }

        await sendGoogleChatMessage({
            text: suggestion.payload.text,
            card: suggestion.payload.card,
            channel: "personal_dm",
            recipientMember: player.name,
            webhookUrl: decryptIntegrationToken(webhookRow.webhook_url),
        });

        return NextResponse.json({
            sent: true,
            suggestion: {
                id: suggestion.id,
                title: suggestion.title,
            },
        });
    } catch (error) {
        return internalErrorResponse(
            "test-briefing-send",
            error,
            "테스트 브리핑을 발송하지 못했습니다.",
        );
    }
}
