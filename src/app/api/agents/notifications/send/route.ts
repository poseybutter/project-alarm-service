import { NextResponse, type NextRequest } from "next/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import {
    consumeSharedRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/shared/server/rateLimit";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import type { AgentSuggestion, NotificationSuggestionPayload } from "@/features/agents/server/types";
import {
    hasRecentNotificationDelivery,
    recordNotificationDelivery,
} from "@/features/agents/server/notificationDeliveries";
import { updateAgentSuggestionStatus } from "@/features/agents/server/suggestions";
import { DeliveryUnknownError, sendGoogleChatMessage } from "@/infrastructure/google-chat";
import { decryptIntegrationToken } from "@/infrastructure/security/tokenEncryption";

type SendRequest = {
    id?: number;
};

function isNotificationPayload(
    payload: Record<string, unknown>,
): payload is NotificationSuggestionPayload {
    return typeof payload.text === "string" && payload.text.trim().length > 0;
}

export async function POST(req: NextRequest) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (role !== "admin") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // 외부 채팅 웹훅 발송이므로 남용을 막는다.
    const rate = await consumeSharedRateLimit(
        requestRateLimitKey(req, "agent-notifications-send", user.email),
        { limit: 30, windowMs: 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    let body: SendRequest;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    if (!Number.isInteger(body.id)) {
        return NextResponse.json({ message: "id is required" }, { status: 400 });
    }

    const service = createServiceSupabaseClient();
    const { data, error } = await service
        .from("agent_suggestions")
        .select("*")
        .eq("team_id", teamId)
        .eq("id", body.id)
        .in("agent_type", ["notification", "accessibility_reminder"])
        .eq("status", "approved")
        .maybeSingle();

    if (error) {
        return internalErrorResponse(
            "agent-notification-send-load",
            error,
            "알림 제안을 불러오지 못했습니다.",
        );
    }
    if (!data) {
        return NextResponse.json(
            { message: "Approved notification suggestion not found" },
            { status: 404 },
        );
    }

    const suggestion = data as AgentSuggestion;
    if (!isNotificationPayload(suggestion.payload)) {
        return NextResponse.json(
            { message: "Suggestion payload does not contain sendable text" },
            { status: 400 },
        );
    }

    try {
        if (
            suggestion.dedupe_key &&
            (await hasRecentNotificationDelivery(service, {
                teamId,
                dedupeKey: suggestion.dedupe_key,
            }))
        ) {
            return NextResponse.json(
                { message: "Notification is in cooldown window" },
                { status: 409 },
            );
        }

        let webhookUrl: string | null = null;
        if (
            suggestion.payload.channel === "personal_dm" &&
            suggestion.payload.recipientMember
        ) {
            const { data: webhookRow, error: webhookError } = await service
                .from("agent_member_webhooks")
                .select("webhook_url")
                .eq("team_id", teamId)
                .eq("member", suggestion.payload.recipientMember)
                .maybeSingle();

            if (webhookError) throw webhookError;
            webhookUrl = decryptIntegrationToken(webhookRow?.webhook_url);
        }

        try {
            await sendGoogleChatMessage({
                text: suggestion.payload.text,
                card: suggestion.payload.card,
                channel: suggestion.payload.channel,
                recipientMember: suggestion.payload.recipientMember,
                webhookUrl,
            });
        } catch (err) {
            if (err instanceof DeliveryUnknownError) {
                // 타임아웃 — Google 측 처리 여부 불명. 중복 발송 방지를 위해 applied로 표시합니다.
                const updated = await updateAgentSuggestionStatus(service, {
                    id: suggestion.id,
                    teamId,
                    status: "applied",
                    reviewedBy: user.email,
                });
                return NextResponse.json(
                    { suggestion: updated, warning: "전송 결과를 확인할 수 없습니다. 중복 발송을 방지하기 위해 완료 처리되었습니다." },
                    { status: 202 },
                );
            }
            throw err;
        }
        const updated = await updateAgentSuggestionStatus(service, {
            id: suggestion.id,
            teamId,
            status: "applied",
            reviewedBy: user.email,
        });

        try {
            await recordNotificationDelivery(service, {
                suggestion,
                payload: suggestion.payload,
                sentBy: user.email,
            });
        } catch (deliveryErr) {
            console.error("[agent-notification-delivery-record]", deliveryErr);
            return NextResponse.json({
                suggestion: updated,
                warning: "발송 이력을 기록하지 못했습니다.",
            });
        }

        return NextResponse.json({ suggestion: updated });
    } catch (error) {
        return internalErrorResponse(
            "agent-notification-send",
            error,
            "알림을 발송하지 못했습니다.",
        );
    }
}
