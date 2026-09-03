import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/infrastructure/supabase/server";

type RateWindow = { count: number; resetAt: number };

const globalRateLimit = globalThis as typeof globalThis & {
    __projectRateLimits?: Map<string, RateWindow>;
};
const windows =
    globalRateLimit.__projectRateLimits ??
    (globalRateLimit.__projectRateLimits = new Map<string, RateWindow>());

export function requestRateLimitKey(
    request: Request,
    namespace: string,
    identity = "anonymous",
) {
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0];
    const address = forwardedFor?.trim() || request.headers.get("x-real-ip") || "local";
    return createHash("sha256")
        .update(`${namespace}:${address}:${identity.toLowerCase()}`)
        .digest("base64url");
}

export function consumeRateLimit(
    key: string,
    options: { limit: number; windowMs: number },
) {
    const now = Date.now();
    const current = windows.get(key);
    if (!current || current.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + options.windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
    }

    if (current.count >= options.limit) {
        return {
            allowed: false,
            retryAfterSeconds: Math.max(
                1,
                Math.ceil((current.resetAt - now) / 1000),
            ),
        };
    }

    current.count += 1;
    if (windows.size > 5_000) {
        for (const [windowKey, value] of windows) {
            if (value.resetAt <= now) windows.delete(windowKey);
        }
    }
    return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * 배포 전체에서 공유되는 레이트리밋 판정 (V54 consume_rate_limit RPC).
 *
 * 인메모리 카운터는 서버리스 인스턴스마다 따로 세서 콜드스타트·수평 확장 시
 * 한도를 넘길 수 있다. 로컬 카운터를 1차 방어로 먼저 확인해 값싸게 거르고,
 * 통과하면 DB 의 원자적 카운터로 전역 한도를 확정한다.
 * RPC 실패(마이그레이션 미적용·일시 장애)에는 가용성 우선으로 통과시킨다.
 */
export async function consumeSharedRateLimit(
    key: string,
    options: { limit: number; windowMs: number },
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const local = consumeRateLimit(key, options);
    if (!local.allowed) return local;

    try {
        const service = createServiceSupabaseClient();
        const { data, error } = await service.rpc("consume_rate_limit", {
            p_key: key,
            p_limit: options.limit,
            p_window_ms: options.windowMs,
        });
        if (error) throw error;
        const row = (Array.isArray(data) ? data[0] : data) as
            | { allowed: boolean; retry_after_seconds: number }
            | undefined;
        if (row && row.allowed === false) {
            return {
                allowed: false,
                retryAfterSeconds: Math.max(1, row.retry_after_seconds || 1),
            };
        }
        return { allowed: true, retryAfterSeconds: 0 };
    } catch (error) {
        console.error("[rate-limit] shared counter unavailable", error);
        return { allowed: true, retryAfterSeconds: 0 };
    }
}

export function rateLimitResponse(retryAfterSeconds: number) {
    return NextResponse.json(
        { message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
            status: 429,
            headers: { "Retry-After": String(retryAfterSeconds) },
        },
    );
}

