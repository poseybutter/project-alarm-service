import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * PIN 검증 성공 후 발급되는 단기 HMAC 토큰.
 * reveal API에서 scrypt를 다시 실행하지 않고 빠르게 인가를 확인한다.
 *
 * 토큰 구조: `${timestamp}.${hmac}`
 * - timestamp: 발급 시각 (ms)
 * - hmac: HMAC-SHA256(secret, `${teamId}:${pinHashPrefix}:${timestamp}`)
 *
 * pinHashPrefix를 포함하므로 PIN 변경 시 기존 토큰이 자동 무효화된다.
 */

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5분

function getSecret(): string {
    return (
        process.env.PIN_TOKEN_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        "fallback-pin-token-secret"
    );
}

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
