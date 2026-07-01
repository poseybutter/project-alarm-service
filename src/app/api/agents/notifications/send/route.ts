import { NextResponse, type NextRequest } from "next/server";
import { TEAM_ID } from "@/lib/constants";
import { getServerUserRole } from "@/lib/serverSupabase";
import type { AgentSuggestion, NotificationSuggestionPayload } from "@/lib/agents/types";
import {
    hasRecentNotificationDelivery,
    recordNotificationDelivery,
} from "@/lib/agents/notificationDeliveries";
import { updateAgentSuggestionStatus } from "@/lib/agents/suggestions";
import { sendGoogleChatMessage } from "@/lib/server/googleChat";

type SendRequest = {
    id?: number;
};

function isNotificationPayload(
    payload: Record<string, unknown>,
): payload is NotificationSuggestionPayload {
    return typeof payload.text === "string" && payload.text.trim().length > 0;
}

export async function POST(req: NextRequest) {
    const { supabase, user, role } = await getServerUserRole(TEAM_ID);
    if (!user?.email) {
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

    const { data, error } = await supabase
        .from("agent_suggestions")
        .select("*")
        .eq("team_id", TEAM_ID)
        .eq("id", body.id)
        .in("agent_type", ["notification", "accessibility_reminder"])
        .eq("status", "approved")
        .maybeSingle();

    if (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
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
            (await hasRecentNotificationDelivery(supabase, {
                teamId: TEAM_ID,
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
            const { data: webhookRow, error: webhookError } = await supabase
                .from("agent_member_webhooks")
                .select("webhook_url")
                .eq("team_id", TEAM_ID)
                .eq("member", suggestion.payload.recipientMember)
                .maybeSingle();

            if (webhookError) throw webhookError;
            webhookUrl = webhookRow?.webhook_url ?? null;
        }

        await sendGoogleChatMessage({
            text: suggestion.payload.text,
            card: suggestion.payload.card,
            channel: suggestion.payload.channel,
            recipientMember: suggestion.payload.recipientMember,
            webhookUrl,
        });
        const updated = await updateAgentSuggestionStatus(supabase, {
            id: suggestion.id,
            teamId: TEAM_ID,
            status: "applied",
            reviewedBy: user.email,
        });

        try {
            await recordNotificationDelivery(supabase, {
                suggestion,
                payload: suggestion.payload,
                sentBy: user.email,
            });
        } catch (deliveryErr) {
            const warning =
                deliveryErr instanceof Error
                    ? deliveryErr.message
                    : "Failed to record notification delivery";
            return NextResponse.json({ suggestion: updated, warning });
        }

        return NextResponse.json({ suggestion: updated });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to send notification";
        return NextResponse.json({ message }, { status: 500 });
    }
}
