import "server-only";

import * as OTPAuth from "otpauth";

const ISSUER = "PubTeam";
const DIGITS = 6;
const PERIOD = 30;

/** 20바이트(160비트) 랜덤 TOTP 시크릿 생성 (base32) */
export function generateTotpSecret(): string {
    const secret = new OTPAuth.Secret({ size: 20 });
    return secret.base32;
}

/** Google Authenticator QR 스캔용 otpauth:// URI 생성 */
export function getTotpUri(
    secret: string,
    userEmail: string,
    teamName: string,
): string {
    const totp = new OTPAuth.TOTP({
        issuer: `${ISSUER} - ${teamName}`,
        label: userEmail,
        algorithm: "SHA1",
        digits: DIGITS,
        period: PERIOD,
        secret: OTPAuth.Secret.fromBase32(secret),
    });
    return totp.toString();
}

/**
 * 6자리 TOTP 코드 검증.
 * window=1 → 현재 + 전후 1 period (총 90초 허용) — 시계 드리프트 대비.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
    const totp = new OTPAuth.TOTP({
        algorithm: "SHA1",
        digits: DIGITS,
        period: PERIOD,
        secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
}
