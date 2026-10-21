import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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
    return verifyTotpCodeStep(secret, code) !== null;
}

/**
 * 코드 검증 후 일치한 time-step(= floor(epoch초 / PERIOD)) 을 반환한다. 불일치면 null.
 * 재사용(replay) 방지를 위해 호출자는 이 값을 totp_secrets.last_used_step 과
 * 비교·갱신해야 한다 (consumeTotpStep 참고).
 */
export function verifyTotpCodeStep(secret: string, code: string): number | null {
    const totp = new OTPAuth.TOTP({
        algorithm: "SHA1",
        digits: DIGITS,
        period: PERIOD,
        secret: OTPAuth.Secret.fromBase32(secret),
    });
    const now = Date.now();
    const delta = totp.validate({ token: code, window: 1, timestamp: now });
    if (delta === null) return null;
    return Math.floor(now / 1000 / PERIOD) + delta;
}

/**
 * TOTP time-step 을 원자적으로 소비한다 (V66 totp_secrets.last_used_step).
 * 같은 step 이하의 코드는 이미 사용된 것으로 보고 false 를 반환한다.
 * 단일 UPDATE ... WHERE last_used_step < step 이므로 동시 요청에서도
 * 정확히 하나만 성공한다. 컬럼이 없거나 DB 오류면 예외를 던진다(fail-closed).
 */
export async function consumeTotpStep(
    client: SupabaseClient,
    secretRowId: number,
    step: number,
): Promise<boolean> {
    const { data, error } = await client
        .from("totp_secrets")
        .update({ last_used_step: step })
        .eq("id", secretRowId)
        .or(`last_used_step.is.null,last_used_step.lt.${Math.trunc(step)}`)
        .select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
}
