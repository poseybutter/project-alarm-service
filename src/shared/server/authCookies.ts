import type { NextRequest, NextResponse } from "next/server";

const LEGACY_AUTH_COOKIES = ["accessToken", "refreshToken"];

/** 레거시 Spring 인증 쿠키 + sb-* 세션 쿠키 만료 */
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
}
