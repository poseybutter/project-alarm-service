import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/pending"];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
}

export function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;
    const hasAccessToken = Boolean(req.cookies.get("accessToken")?.value);

    if (hasAccessToken && pathname === "/login") {
        const url = req.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
    }

    if (!hasAccessToken && !isPublicPath(pathname)) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
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
        "/((?!api|_next/static|_next/image|favicon.ico|icons|cursors|manifest.json|sw.js|workbox-).*)",
    ],
};
