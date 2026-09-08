import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * CRON 엔드포인트 공용 인증.
 * - 비교는 timingSafeEqual 로 수행해 문자열 === 의 타이밍 채널을 없앤다.
 * - CRON_SECRET 미설정 시 개발 환경에서만 통과 (프로덕션은 항상 거부).
 */
export function isCronAuthorized(req: {
    headers: { get(name: string): string | null };
}) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return process.env.NODE_ENV !== "production";

    const header = Buffer.from(req.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    return header.length === expected.length && timingSafeEqual(header, expected);
}
