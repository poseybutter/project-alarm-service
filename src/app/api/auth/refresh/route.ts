import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiError, refreshToken } from "@/lib/api";

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";

export async function POST() {
    const store = await cookies();
    const refresh = store.get(REFRESH_COOKIE)?.value;
    if (!refresh) {
        return NextResponse.json(
            { message: "리프레시 토큰이 없어요" },
            { status: 401 },
        );
    }

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
        const status = err instanceof ApiError ? err.status : 401;
        const message =
            err instanceof Error ? err.message : "토큰 갱신에 실패했어요";
        return NextResponse.json({ message }, { status });
    }
}
