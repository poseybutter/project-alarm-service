import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiError, refreshToken } from "@/lib/api";
import { internalErrorResponse } from "@/lib/server/apiResponse";
import {
    consumeRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/lib/server/rateLimit";

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";

export async function POST(request: Request) {
    const store = await cookies();
    const refresh = store.get(REFRESH_COOKIE)?.value;
    if (!refresh) {
        return NextResponse.json(
            { message: "리프레시 토큰이 없어요" },
            { status: 401 },
        );
    }
    const rate = consumeRateLimit(
        requestRateLimitKey(request, "auth-refresh"),
        { limit: 30, windowMs: 10 * 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    try {
        const data = await refreshToken(refresh);

        const res = NextResponse.json({ ok: true });
        const isProd = process.env.NODE_ENV === "production";

        res.cookies.set(ACCESS_COOKIE, data.accessToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: "lax",
            path: "/",
        });

        if (data.refreshToken) {
            res.cookies.set(REFRESH_COOKIE, data.refreshToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: "lax",
                path: "/",
            });
        }

        return res;
    } catch (err) {
        if (err instanceof ApiError) {
            return NextResponse.json(
                { message: "세션이 만료되었습니다. 다시 로그인해주세요." },
                { status: err.status },
            );
        }
        return internalErrorResponse(
            "auth-refresh",
            err,
            "토큰 갱신에 실패했어요.",
        );
    }
}
