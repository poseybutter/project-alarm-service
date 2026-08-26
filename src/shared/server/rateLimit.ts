import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

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

export function rateLimitResponse(retryAfterSeconds: number) {
    return NextResponse.json(
        { message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
            status: 429,
            headers: { "Retry-After": String(retryAfterSeconds) },
        },
    );
}

