import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase OAuth 콜백 처리 경로는 항상 통과시켜야 한다.
 * (인증 직후 ?code= 쿼리로 돌아오는데, 막히면 세션 생성 자체가 불가능)
 */
const PUBLIC_PATHS = ["/login", "/signup", "/pending", "/auth/callback"];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
}

/** Supabase 세션 쿠키는 `sb-<projectRef>-auth-token` 또는 청크된 `.0`, `.1` 형태. */
function hasSupabaseSession(req: NextRequest): boolean {
    return req.cookies
        .getAll()
        .some(
            (c) =>
                c.name.startsWith("sb-") &&
                c.name.includes("-auth-token") &&
                Boolean(c.value),
        );
}

export function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;
    const hasAccessToken = Boolean(req.cookies.get("accessToken")?.value);
    const isAuthed = hasAccessToken || hasSupabaseSession(req);

    if (isAuthed && pathname === "/login") {
        const url = req.nextUrl.clone();
        const next = req.nextUrl.searchParams.get("next");
        url.pathname = next?.startsWith("/") ? next : "/home";
        url.search = "";
        return NextResponse.redirect(url);
    }

    if (!isAuthed && !isPublicPath(pathname)) {
        const url = req.nextUrl.clone();
        const next = `${pathname}${req.nextUrl.search}`;
        url.pathname = "/login";
        url.search = "";
        url.searchParams.set("next", next);
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    /**
     * 정적 자산·이미지·내부 API 라우트는 미들웨어 우회.
     * /api/* 도 우회 — 인증은 각 Route Handler에서 별도로 처리.
     */
    matcher: [
        "/((?!api|_next|favicon.ico|icons|cursors|manifest.json|sw.js|workbox-|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)",
    ],
};
