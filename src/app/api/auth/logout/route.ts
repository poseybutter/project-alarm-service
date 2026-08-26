import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { minimizedAuditMetadata } from "@/lib/server/auditMetadata";

export async function POST(req: NextRequest) {
    const store = await cookies();

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
            const { ip, userAgent } = minimizedAuditMetadata(req);
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
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
            console.error("[logout] supabase signOut failed:", signOutError);
        }
    } catch (err) {
        console.error("[logout] audit_logs flow failed:", err);
    }

    return NextResponse.json({ ok: true });
}
