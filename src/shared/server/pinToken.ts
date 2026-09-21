import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

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
    return (
        process.env.PIN_TOKEN_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        "fallback-pin-token-secret"
    );
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
 * 인메모리 revocation map: TOTP 초기화 시 기존 토큰 즉시 무효화.
 * key = `${teamId}:${profileId}`, value = 폐기 시각(ms).
 * TTL이 지난 항목은 자동 정리된다.
 *
 * 단일 프로세스 전제 — 다중 인스턴스 배포 시 Redis 또는 DB 기반
 * revocation store로 교체 필요. 현재 단일 인스턴스이며 TTL이 5분이므로
 * 최악 시나리오에서도 리스크 윈도우가 제한된다.
 */
const revokedAt = new Map<string, number>();

/** 관리자 TOTP 초기화 시 호출 — 해당 사용자의 기존 verify token을 즉시 폐기 */
export function revokeVerifyTokens(teamId: string, profileId: string): void {
    const key = `${teamId}:${profileId}`;
    revokedAt.set(key, Date.now());

    // TTL이 지난 항목 정리
    const cutoff = Date.now() - TOKEN_TTL_MS;
    for (const [k, v] of revokedAt) {
        if (v < cutoff) revokedAt.delete(k);
    }
}

/** TOTP 검증 성공 후 발급 — profileId를 바인딩하여 사용자별 토큰 */
export function issueVerifyToken(teamId: string, profileId: string): string {
    const ts = Date.now().toString();
    const hmac = createHmac("sha256", getSecret())
        .update(`${teamId}:${profileId}:${ts}`)
        .digest("base64url");
    return `${ts}.${hmac}`;
}

export function validateVerifyToken(
    teamId: string,
    token: string,
    profileId: string,
): boolean {
    const dot = token.indexOf(".");
    if (dot < 1) return false;

    const ts = token.slice(0, dot);
    const hmac = token.slice(dot + 1);
    const issued = Number(ts);
    if (!issued || Date.now() - issued > TOKEN_TTL_MS) return false;

    // 폐기된 토큰인지 확인: 발급 시각이 revocation 시각보다 이전이면 무효
    const revokeKey = `${teamId}:${profileId}`;
    const revoked = revokedAt.get(revokeKey);
    if (revoked && issued <= revoked) return false;

    const expected = createHmac("sha256", getSecret())
        .update(`${teamId}:${profileId}:${ts}`)
        .digest("base64url");

    const actualBuf = Buffer.from(hmac, "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    if (actualBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(actualBuf, expectedBuf);
}
