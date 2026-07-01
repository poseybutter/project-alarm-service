import type { NotificationChannel } from "@/lib/agents/types";
import type { GoogleChatCardPayload } from "@/lib/agents/types";

type SendGoogleChatParams = {
    text: string;
    card?: GoogleChatCardPayload;
    channel?: NotificationChannel;
    recipientMember?: string;
    webhookUrl?: string | null;
};

function parseWebhookMap(): Record<string, string> {
    const raw = process.env.GOOGLE_CHAT_WEBHOOKS;
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsed).filter(
                (entry): entry is [string, string] =>
                    typeof entry[0] === "string" &&
                    typeof entry[1] === "string" &&
                    entry[1].startsWith("https://"),
            ),
        );
    } catch {
        return {};
    }
}

function resolveWebhook(params: SendGoogleChatParams) {
    if (params.webhookUrl) return params.webhookUrl;

    if (params.channel === "personal_dm" && params.recipientMember) {
        const memberWebhook = parseWebhookMap()[params.recipientMember];
        if (memberWebhook) return memberWebhook;
        return null;
    }

    return process.env.GOOGLE_CHAT_WEBHOOK || null;
}

export async function sendGoogleChatMessage(params: SendGoogleChatParams) {
    const webhook = resolveWebhook(params);
    if (!webhook) {
        throw new Error(
            params.channel === "personal_dm"
                ? `Google Chat webhook is not configured for ${params.recipientMember ?? "recipient"}`
                : "GOOGLE_CHAT_WEBHOOK is not configured",
        );
    }

    const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
            params.card
                ? {
                      cardsV2: [
                          {
                              cardId: "agent-notification",
                              card: {
                                  header: {
                                      title: params.card.title,
                                      subtitle: params.card.subtitle,
                                  },
                                  sections: params.card.sections,
                              },
                          },
                      ],
                  }
                : { text: params.text },
        ),
    });

    if (!res.ok) {
        throw new Error(`Google Chat webhook failed: ${res.status}`);
    }
}
