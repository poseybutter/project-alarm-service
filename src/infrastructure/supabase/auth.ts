import { supabase } from "@/infrastructure/supabase/client";

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
// 서버 로그아웃 성공 후에는 브라우저 클라이언트의 로컬 상태도 정리해야
// SIGNED_OUT 이벤트가 발생해 AuthProvider 가 사용자 상태를 초기화한다 (전체 리로드 없이 라우팅하므로 필수).
export async function signOut() {
    try {
        const res = await fetch("/api/auth/logout", { method: "POST" });
        if (!res.ok) throw new Error(`logout failed: ${res.status}`);
    } catch (err) {
        console.error("[signOut] /api/auth/logout failed:", err);
        // 서버 라우트 실패 시 최소한 클라이언트 세션은 정리
        await supabase.auth.signOut();
        return;
    }
    // 토큰 폐기는 서버 라우트가 이미 수행 — 로컬 상태만 비운다
    await supabase.auth.signOut({ scope: "local" });
}

// 현재 유저
export async function getCurrentUser() {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}

// 이메일 → 팀원명 매핑은 DB(players/profiles)가 단일 출처다.
// 과거의 NEXT_PUBLIC_MEMBER_EMAILS 매핑은 팀원 이메일·실명을
// 공개 JS 번들에 노출시키므로 제거했다. 되살리지 말 것.
