import { NextResponse } from "next/server";
import { ApiError, login } from "@/lib/api";

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
            return NextResponse.json(
                { message: err.message },
                { status: err.status },
            );
        }
        const message =
            err instanceof Error ? err.message : "로그인에 실패했어요";
        return NextResponse.json({ message }, { status: 500 });
    }
}
