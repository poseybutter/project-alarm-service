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
    /** team_room 발송 시 대상 팀. 전역 env 웹훅을 쓸 수 있는 팀인지 판정한다. */
    teamId?: string | null;
};

/**
 * 전역 env `GOOGLE_CHAT_WEBHOOK`(팀 대화방)을 쓸 수 있는 레거시 단일 팀 ID.
 *
 * 팀별 대화방 웹훅을 저장하는 테이블이 아직 없어서, 멀티 팀 환경에서 전역 웹훅을
 * 아무 팀에나 쓰면 다른 팀 대화방으로 메시지가 새어 나간다. 그래서 전역 웹훅은
 * 이 앱이 단일 팀이던 시절의 팀(구 `TEAM_ID` 상수)에만 허용하고, 나머지 팀의
 * team_room 발송은 건너뛴다. 팀별 웹훅 저장소가 생기면 이 폴백을 제거한다.
 */
export const LEGACY_TEAM_ROOM_TEAM_ID = "ud2";

/** team_room 발송을 건너뛰어야 할 때(설정된 팀 웹훅 없음) 발생합니다. */
export class TeamRoomWebhookUnavailableError extends Error {
    constructor(teamId: string | null | undefined) {
        super(`팀(${teamId ?? "unknown"})의 대화방 웹훅이 설정되어 있지 않습니다`);
        this.name = "TeamRoomWebhookUnavailableError";
    }
}

/** team_room 발송에 쓸 웹훅. 레거시 팀만 전역 env 웹훅을 쓰고, 그 외 팀은 null. */
export function resolveTeamRoomWebhook(teamId: string | null | undefined) {
    if (!teamId || teamId !== LEGACY_TEAM_ROOM_TEAM_ID) return null;
    return process.env.GOOGLE_CHAT_WEBHOOK || null;
}

function resolveWebhook(params: SendGoogleChatParams) {
    // personal_dm은 호출부가 DB(agent_member_webhooks, team_id + email)에서 찾은
    // webhookUrl만 사용한다. 이름 기반 env 폴백은 동명이인·타 팀으로 새어 나갈 수 있어 쓰지 않는다.
    if (params.channel === "personal_dm") {
        if (!params.recipientMember) {
            throw new Error("personal_dm 채널은 recipientMember가 필요합니다");
        }
        if (params.webhookUrl) return params.webhookUrl;
        throw new Error(
            `개인 Google Chat webhook이 등록되어 있지 않습니다 (${params.recipientMember})`,
        );
    }

    if (params.webhookUrl) return params.webhookUrl;
    const teamWebhook = resolveTeamRoomWebhook(params.teamId);
    if (!teamWebhook) throw new TeamRoomWebhookUnavailableError(params.teamId);
    return teamWebhook;
}

export async function sendGoogleChatMessage(params: SendGoogleChatParams) {
    const webhook = resolveWebhook(params);

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
