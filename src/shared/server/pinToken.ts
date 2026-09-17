import "server-only";

import { createHmac, randomBytes } from "crypto";

/**
 * PIN 검증 성공 후 발급되는 단기 HMAC 토큰.
 * reveal API에서 scrypt를 다시 실행하지 않고 빠르게 인가를 확인한다.
 *
 * 토큰 구조: `${timestamp}.${hmac}`
 * - timestamp: 발급 시각 (ms)
 * - hmac: HMAC-SHA256(secret, `${teamId}:${timestamp}`)
 */

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5분

function getSecret(): string {
    // 환경변수 우선, 없으면 SUPABASE_SERVICE_ROLE_KEY에서 파생
    return (
        process.env.PIN_TOKEN_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        "fallback-pin-token-secret"
    );
}

export function issuePinToken(teamId: string): string {
    const ts = Date.now().toString();
    const hmac = createHmac("sha256", getSecret())
        .update(`${teamId}:${ts}`)
        .digest("base64url");
    return `${ts}.${hmac}`;
}

export function validatePinToken(
    teamId: string,
    token: string,
): boolean {
    const dot = token.indexOf(".");
    if (dot < 1) return false;

    const ts = token.slice(0, dot);
    const hmac = token.slice(dot + 1);
    const issued = Number(ts);
    if (!issued || Date.now() - issued > TOKEN_TTL_MS) return false;

    const expected = createHmac("sha256", getSecret())
        .update(`${teamId}:${ts}`)
        .digest("base64url");

    // timing-safe comparison
    if (hmac.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < hmac.length; i++) {
        diff |= hmac.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
}
