import { NextResponse } from "next/server";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import {
    buildNotificationSuggestions,
    type CalendarEventInput,
    type QuestBriefingInput,
} from "@/features/agents/server/notificationAgent";
import { sendGoogleChatMessage } from "@/infrastructure/google-chat";
import {
    syncTodayTeamCalendarEvents,
    todayKstWindow,
} from "@/infrastructure/google-calendar";
import { hasAdminPermission } from "@/features/admin/server/adminRepository";
import type {
    AgentSuggestion,
    NotificationSuggestionPayload,
} from "@/features/agents/server/types";
import type { Accessibility, Task } from "@/shared/types";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { decryptIntegrationToken } from "@/infrastructure/security/tokenEncryption";
import {
    consumeSharedRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/shared/server/rateLimit";
import { resolveTeamMember } from "@/features/identity/server/identityRepository";

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
    const { timeMin, timeMax } = todayKstWindow();

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
            // 오늘과 겹치는 일정만 — 날짜 제한이 없으면 누적된 전체 일정을 읽는다
            .lt("starts_at", timeMax)
            .gt("ends_at", timeMin)
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
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const rate = await consumeSharedRateLimit(
        requestRateLimitKey(request, "briefing-test", user.email),
        { limit: 5, windowMs: 5 * 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    try {
        const serviceSupabase = createServiceSupabaseClient();
        const member = await resolveTeamMember(serviceSupabase, user.email, teamId);
        if (!member) {
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

        const fresh = await buildFreshSuggestion(serviceSupabase, {
            member: member.name,
            email: user.email,
            teamId,
            canSyncTeamCalendar: await hasAdminPermission(
                teamId,
                "integrations.manage",
            ),
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

        const suggestion = refreshed as AgentSuggestion;

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
            .eq("payload->>recipientMember", member.name)
            .like(
                "dedupe_key",
                `notification:member:${member.name}:${todayKstYmd()}:%`,
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
            recipientMember: member.name,
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
