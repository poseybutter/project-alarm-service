import "server-only";

import type { NotificationChannel } from "@/features/agents/server/types";
import type { GoogleChatCardPayload } from "@/features/agents/server/types";

/**
 * fetch 타임아웃 후 원격 처리 결과를 알 수 없을 때 발생합니다.
 * 호출부는 이 오류를 `delivery_failed`가 아닌 `delivery_unknown` 상태로 기록해야 합니다.
 */
export class DeliveryUnknownError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DeliveryUnknownError";
    }
}

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
    // personal_dm은 명시적 webhookUrl보다 수신자 검증을 먼저 수행합니다.
    // 수신자 없이 팀 웹훅으로 폴백·전송되는 것을 방지합니다.
    if (params.channel === "personal_dm") {
        if (!params.recipientMember) {
            throw new Error("personal_dm 채널은 recipientMember가 필요합니다");
        }
        if (params.webhookUrl) return params.webhookUrl;
        const memberWebhook = parseWebhookMap()[params.recipientMember];
        if (memberWebhook) return memberWebhook;
        return null;
    }

    if (params.webhookUrl) return params.webhookUrl;
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
        res = await fetch(webhook, {
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
            signal: controller.signal,
        });
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            throw new DeliveryUnknownError(
                "Google Chat webhook 요청이 타임아웃되었습니다 — 전송 결과를 알 수 없습니다",
            );
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        throw new Error(`Google Chat webhook failed: ${res.status}`);
    }
}
