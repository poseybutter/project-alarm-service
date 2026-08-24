import { NextResponse } from "next/server";
import { ApiError, login } from "@/lib/api";
import { internalErrorResponse } from "@/lib/server/apiResponse";
import {
    consumeRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/lib/server/rateLimit";

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";

export async function POST(req: Request) {
    let payload: { email?: string; password?: string };
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json(
            { message: "잘못된 요청 형식이에요" },
            { status: 400 },
        );
    }

    const email = payload.email?.trim();
    const password = payload.password;
    if (!email || !password) {
        return NextResponse.json(
            { message: "이메일과 비밀번호를 입력해주세요" },
            { status: 400 },
        );
    }

    const rate = consumeRateLimit(
        requestRateLimitKey(req, "auth-login", email),
        { limit: 10, windowMs: 10 * 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    try {
        const data = await login(email, password);

        const res = NextResponse.json({
            ok: true,
            user: data.user ?? null,
        });

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
            const message =
                err.status === 401
                    ? "이메일 또는 비밀번호를 확인해주세요."
                    : "로그인 요청을 처리하지 못했습니다.";
            return NextResponse.json(
                { message },
                { status: err.status },
            );
        }
        return internalErrorResponse("auth-login", err, "로그인에 실패했어요.");
    }
}
