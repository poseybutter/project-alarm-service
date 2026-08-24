import { supabase } from "./supabase";

// 구글 로그인
export async function signInWithGoogle() {
    const siteUrl =
        typeof window === "undefined"
            ? process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
            : window.location.origin;
    const next =
        typeof window === "undefined"
            ? null
            : new URLSearchParams(window.location.search).get("next");
    const callbackUrl = new URL(`${siteUrl}/auth/callback`);
    if (next?.startsWith("/")) {
        callbackUrl.searchParams.set("next", next);
    }

    const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: callbackUrl.toString(),
        },
    });
    if (error) console.error(error);
}

// 로그아웃
// 서버 라우트(/api/auth/logout)를 거쳐야 audit_logs 기록 + Supabase signOut + 백엔드 세션 종료가 함께 처리된다.
// 클라이언트에서 supabase.auth.signOut()을 직접 부르면 sb-* 쿠키가 먼저 사라져 서버에서 세션을 못 읽는다.
export async function signOut() {
    try {
        await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
        console.error("[signOut] /api/auth/logout failed:", err);
        // 서버 라우트 실패 시 최소한 클라이언트 세션은 정리
        await supabase.auth.signOut();
    }
}

// 현재 유저
export async function getCurrentUser() {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}

// 이메일 → 팀원명 매핑 (환경변수 기반)
export function getMemberName(email: string | undefined) {
    if (!email) return null;
    const map = Object.fromEntries(
        (process.env.NEXT_PUBLIC_MEMBER_EMAILS || "")
            .split(",")
            .filter(Boolean)
            .map((pair) => pair.split(":")),
    );
    return map[email] ?? null;
}
