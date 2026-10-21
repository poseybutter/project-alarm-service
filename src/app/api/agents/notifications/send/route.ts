import { NextResponse, type NextRequest } from "next/server";
import {
    AdminApiError,
    requireAdminSession,
} from "@/features/admin/server/adminRepository";
import { adminErrorResponse } from "@/features/admin/server/http";
import { listActiveTeamMembers } from "@/features/identity/server/identityRepository";
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
import {
    DeliveryUnknownError,
    resolveTeamRoomWebhook,
    sendGoogleChatMessage,
} from "@/infrastructure/google-chat";
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
    const { user, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    try {
        // role 문자열만으로는 커스텀 역할 권한을 반영하지 못하므로 관리자 세션으로 확인한다.
        await requireAdminSession(teamId, "integrations.manage");
    } catch (error) {
        if (error instanceof AdminApiError) return adminErrorResponse(error);
        return internalErrorResponse(
            "agent-notification-send-auth",
            error,
            "권한을 확인하지 못했습니다.",
        );
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
        if (suggestion.payload.channel === "personal_dm") {
            // 이름은 팀 간·팀 내에서 겹칠 수 있으므로 수신자 이메일로 웹훅을 찾는다.
            const recipientName = suggestion.payload.recipientMember;
            const recipients = recipientName
                ? (await listActiveTeamMembers(service, teamId)).filter(
                      (m) => m.name === recipientName && Boolean(m.email),
                  )
                : [];
            if (recipients.length !== 1) {
                return NextResponse.json(
                    { message: "알림 수신자를 팀에서 확인할 수 없습니다." },
                    { status: 400 },
                );
            }

            const { data: webhookRow, error: webhookError } = await service
                .from("agent_member_webhooks")
                .select("webhook_url")
                .eq("team_id", teamId)
                .eq("email", recipients[0].email)
                .maybeSingle();

            if (webhookError) throw webhookError;
            webhookUrl = decryptIntegrationToken(webhookRow?.webhook_url);
            if (!webhookUrl) {
                return NextResponse.json(
                    { message: `${recipientName}님의 개인 Google Chat webhook이 등록되어 있지 않습니다.` },
                    { status: 400 },
                );
            }
        } else {
            webhookUrl = resolveTeamRoomWebhook(teamId);
            if (!webhookUrl) {
                return NextResponse.json(
                    { message: "이 팀에는 팀 대화방 webhook이 설정되어 있지 않습니다." },
                    { status: 400 },
                );
            }
        }

        try {
            await sendGoogleChatMessage({
                text: suggestion.payload.text,
                card: suggestion.payload.card,
                channel: suggestion.payload.channel,
                recipientMember: suggestion.payload.recipientMember,
                webhookUrl,
                teamId,
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
