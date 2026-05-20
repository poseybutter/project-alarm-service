import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { apiFetch } from "@/lib/api";

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";

export async function POST(req: NextRequest) {
    const store = await cookies();
    const accessToken = store.get(ACCESS_COOKIE)?.value;

    if (accessToken) {
        try {
            await apiFetch("/api/auth/logout", {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` },
            });
        } catch (err) {
            // Spring 호출이 실패해도 클라이언트 세션은 종료해야 하므로 무시
            console.error("[logout] spring call failed:", err);
        }
    }

    // 감사 로그 — Supabase 세션이 살아있으면 로그아웃 시점 기록.
    // 실패해도 로그아웃 흐름은 계속 진행.
    try {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || "",
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
            {
                cookies: {
                    getAll() {
                        return store.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            store.set(name, value, options);
                        });
                    },
                },
            },
        );
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) {
            const forwardedFor = req.headers.get("x-forwarded-for");
            const ip =
                forwardedFor?.split(",")[0]?.trim() ||
                req.headers.get("x-real-ip") ||
                null;
            const userAgent = req.headers.get("user-agent") || null;
            const { error: auditError } = await supabase
                .from("audit_logs")
                .insert({
                    email: user.email,
                    action: "logout",
                    ip,
                    user_agent: userAgent,
                });
            if (auditError) {
                console.error(
                    "[logout] audit_logs insert failed:",
                    auditError,
                );
            }
        }

        // Supabase 세션 종료 — sb-* 인증 쿠키 제거.
        // 실패해도 로그아웃 흐름은 계속 (아래에서 자체 쿠키도 만료시킴).
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
            console.error("[logout] supabase signOut failed:", signOutError);
        }
    } catch (err) {
        console.error("[logout] audit_logs flow failed:", err);
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
    res.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
}
