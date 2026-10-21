import type { NextRequest, NextResponse } from "next/server";

const LEGACY_AUTH_COOKIES = ["accessToken", "refreshToken"];
/** 선택 팀 쿠키 — 다음 로그인 사용자에게 이전 사용자의 팀 선택이 이어지지 않도록 함께 만료 */
const SESSION_SCOPED_COOKIES = ["current_team_id"];

/** 레거시 Spring 인증 쿠키 + sb-* 세션 쿠키 + 선택 팀 쿠키 만료 */
export function clearAuthCookies(req: NextRequest, res: NextResponse) {
    const requestCookieNames = req.cookies.getAll().map((cookie) => cookie.name);
    const authCookieNames = requestCookieNames.filter(
        (name) =>
            LEGACY_AUTH_COOKIES.includes(name) ||
            (name.startsWith("sb-") && name.includes("-auth-token")),
    );

    for (const name of authCookieNames) {
        res.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
    for (const name of SESSION_SCOPED_COOKIES) {
        res.cookies.set(name, "", {
            path: "/",
            maxAge: 0,
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
        });
    }
}
