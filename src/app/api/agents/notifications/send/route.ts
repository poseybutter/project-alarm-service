import { NextResponse, type NextRequest } from "next/server";
import { internalErrorResponse } from "@/lib/server/apiResponse";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/lib/serverSupabase";
import type { AgentSuggestion, NotificationSuggestionPayload } from "@/lib/agents/types";
import {
    hasRecentNotificationDelivery,
    recordNotificationDelivery,
} from "@/lib/agents/notificationDeliveries";
import { updateAgentSuggestionStatus } from "@/lib/agents/suggestions";
import { sendGoogleChatMessage } from "@/lib/server/googleChat";
import { decryptIntegrationToken } from "@/lib/server/tokenEncryption";

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

        await sendGoogleChatMessage({
            text: suggestion.payload.text,
            card: suggestion.payload.card,
            channel: suggestion.payload.channel,
            recipientMember: suggestion.payload.recipientMember,
            webhookUrl,
        });
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
