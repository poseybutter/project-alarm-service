import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { minimizedAuditMetadata } from "@/lib/server/auditMetadata";
import { clearAuthCookies } from "@/lib/server/authCookies";

export async function POST(req: NextRequest) {
    const store = await cookies();
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

    // 감사 로그 — 로그아웃 시점 기록, 실패해도 signOut은 그대로 진행
    try {
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
    } catch (err) {
        console.error("[logout] audit_logs flow failed:", err);
    }

    // Supabase 세션 종료 — 감사 로그 결과와 무관하게 항상 실행
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
        console.error("[logout] supabase signOut failed:", signOutError);
        return NextResponse.json(
            { message: "로그아웃 처리에 실패했습니다." },
            { status: 500 },
        );
    }

    const res = NextResponse.json({ ok: true });
    clearAuthCookies(req, res);
    return res;
}
