import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { legacyTeamRoomWebhook } from "@/infrastructure/google-chat";
import { decryptIntegrationToken } from "@/infrastructure/security/tokenEncryption";

/** V67 미적용 환경(테이블 없음) — 레거시 env 폴백만 쓴다. */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

/** Google Chat 수신 웹훅 URL 형식 검증. 통과하면 null, 아니면 사용자에게 보일 메시지. */
export function validateGoogleChatWebhookUrl(value: string) {
    if (!value.trim()) return "Webhook URL is required";
    try {
        const url = new URL(value);
        const isGoogleChatWebhook =
            url.protocol === "https:" &&
            url.hostname === "chat.googleapis.com" &&
            !url.username &&
            !url.password &&
            (!url.port || url.port === "443") &&
            /^\/v1\/spaces\/[^/]+\/messages$/.test(url.pathname) &&
            Boolean(url.searchParams.get("key")) &&
            Boolean(url.searchParams.get("token"));
        if (isGoogleChatWebhook) return null;
    } catch {
        // The fixed validation message below is intentionally non-specific.
    }
    return "올바른 Google Chat Webhook URL을 입력해주세요.";
}

/**
 * team_room 발송에 쓸 팀 대화방 웹훅.
 * 팀별 저장값(agent_team_webhooks)을 우선하고, 없으면 레거시 팀만 전역 env 로 폴백한다.
 */
export async function resolveTeamRoomWebhook(
    service: SupabaseClient,
    teamId: string,
): Promise<string | null> {
    const { data, error } = await service
        .from("agent_team_webhooks")
        .select("webhook_url")
        .eq("team_id", teamId)
        .maybeSingle();
    if (error && !MISSING_TABLE_CODES.has(error.code)) throw error;
    return decryptIntegrationToken(data?.webhook_url) || legacyTeamRoomWebhook(teamId);
}
