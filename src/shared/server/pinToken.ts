import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 인증 검증 성공 후 발급되는 단기 HMAC 토큰.
 * reveal API에서 재인증 없이 빠르게 인가를 확인한다.
 *
 * 토큰 구조: `${timestamp}.${hmac}`
 * - timestamp: 발급 시각 (ms)
 * - hmac: HMAC-SHA256(secret, `${teamId}:${identifier}:${timestamp}`)
 */

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5분

function getSecret(): string {
    const secret =
        process.env.PIN_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) {
        throw new Error(
            "PIN_TOKEN_SECRET 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다",
        );
    }
    return secret;
}

// ─── Legacy PIN 토큰 (기존 호환) ────────────────────────────────────

/** PIN 해시에서 앞 16자를 식별자로 추출 */
function pinHashPrefix(pinHash: string): string {
    return pinHash.slice(0, 16);
}

export function issuePinToken(teamId: string, currentPinHash: string): string {
    const ts = Date.now().toString();
    const hmac = createHmac("sha256", getSecret())
        .update(`${teamId}:${pinHashPrefix(currentPinHash)}:${ts}`)
        .digest("base64url");
    return `${ts}.${hmac}`;
}

export function validatePinToken(
    teamId: string,
    token: string,
    currentPinHash: string,
): boolean {
    const dot = token.indexOf(".");
    if (dot < 1) return false;

    const ts = token.slice(0, dot);
    const hmac = token.slice(dot + 1);
    const issued = Number(ts);
    if (!issued || Date.now() - issued > TOKEN_TTL_MS) return false;

    const expected = createHmac("sha256", getSecret())
        .update(`${teamId}:${pinHashPrefix(currentPinHash)}:${ts}`)
        .digest("base64url");

    const actualBuf = Buffer.from(hmac, "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    if (actualBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(actualBuf, expectedBuf);
}

// ─── TOTP 검증 토큰 ────────────────────────────────────────────────

/**
 * 토큰 구조: `${timestamp}.${secretId}.${hmac}`
 * - secretId: 발급 당시 검증에 쓴 totp_secrets 행 id
 * - hmac: HMAC-SHA256(secret, `${teamId}:${profileId}:${secretId}:${timestamp}`)
 *
 * 검증 시 현재 시크릿 행 id 와 비교한다. TOTP 초기화는 시크릿 행을 지우므로
 * 이전 토큰은 인스턴스 수와 무관하게 즉시 무효가 된다 (인메모리 폐기 목록 불필요).
 */

/** TOTP 검증 성공 후 발급 — profileId·시크릿 행을 바인딩한 사용자별 토큰 */
export function issueVerifyToken(
    teamId: string,
    profileId: string,
    secretId: number,
): string {
    const ts = Date.now().toString();
    const hmac = createHmac("sha256", getSecret())
        .update(`${teamId}:${profileId}:${secretId}:${ts}`)
        .digest("base64url");
    return `${ts}.${secretId}.${hmac}`;
}

export async function validateVerifyToken(
    svc: SupabaseClient,
    teamId: string,
    token: string,
    profileId: string,
): Promise<boolean> {
    const [ts, secretIdRaw, hmac] = token.split(".");
    if (!ts || !secretIdRaw || !hmac) return false;

    const issued = Number(ts);
    const secretId = Number(secretIdRaw);
    if (!issued || Date.now() - issued > TOKEN_TTL_MS) return false;
    if (!Number.isSafeInteger(secretId) || secretId <= 0) return false;

    const expected = createHmac("sha256", getSecret())
        .update(`${teamId}:${profileId}:${secretId}:${ts}`)
        .digest("base64url");
    const actualBuf = Buffer.from(hmac, "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    if (actualBuf.length !== expectedBuf.length) return false;
    if (!timingSafeEqual(actualBuf, expectedBuf)) return false;

    // 발급 이후 TOTP 가 초기화·재설정되었으면 시크릿 행이 사라지거나 바뀐다
    const { data, error } = await svc
        .from("totp_secrets")
        .select("id")
        .eq("profile_id", profileId)
        .eq("team_id", teamId)
        .not("verified_at", "is", null)
        .maybeSingle();
    if (error) throw error;
    return data?.id === secretId;
}
