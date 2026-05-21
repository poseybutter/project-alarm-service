import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * 서버 라우트/액션에서 사용할 Supabase 클라이언트.
 * 쿠키 어댑터 패턴 동일 — 세션이 살아있는 한 PKCE/refresh가 자동 처리된다.
 */
export async function getSupabaseServer() {
    const store = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        {
            cookies: {
                getAll() {
                    return store.getAll();
                },
                setAll(cookiesToSet) {
                    // Next.js route handler 중 일부 컨텍스트에서 cookieStore.set 이
                    // read-only 로 동작하면 throw 한다. supabase 측이 토큰 refresh 를
                    // 시도할 때 이게 터지면 전체 요청이 500 으로 죽는다.
                    // 공식 권장: route handler 에서는 swallow 해도 안전하다.
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            store.set(name, value, options);
                        });
                    } catch {
                        /* read-only cookie context — ignore */
                    }
                },
            },
        },
    );
}

/** 현재 로그인된 Supabase 사용자의 players 레코드 조회. 없으면 null. */
export async function getCurrentPlayer() {
    const supabase = await getSupabaseServer();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email;
    if (!email) return null;
    const { data } = await supabase
        .from("players")
        .select("id, name, email, status, role, team_id, bio")
        .eq("email", email)
        .maybeSingle();
    return data;
}

/** admin role 보유자만 통과. 아니면 null. */
export async function requireAdmin() {
    const player = await getCurrentPlayer();
    return player?.role === "admin" ? player : null;
}
