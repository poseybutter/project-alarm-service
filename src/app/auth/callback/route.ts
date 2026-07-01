import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase OAuth (Google) 콜백.
 *
 * 1. PKCE code 를 세션으로 교환 (서버에서 처리해야 쿠키가 안정적으로 설정됨)
 * 2. players 테이블 조회 후 status 분기:
 *    - active   → /
 *    - pending  → /pending
 *    - rejected → /login?error=rejected
 * 3. players 에 없으면 status=pending 으로 INSERT 한 뒤 /pending 으로 이동
 *    (관리자 승인 플로우 진입)
 */
export async function GET(req: NextRequest) {
    const { searchParams, origin } = new URL(req.url);
    const code = searchParams.get("code");
    const rawNext = searchParams.get("next");
    const nextPath =
        rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

    if (!code) {
        return NextResponse.redirect(`${origin}/login?error=missing_code`);
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                    });
                },
            },
        },
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session) {
        console.error("[auth/callback] exchangeCodeForSession failed:", {
            message: error?.message,
            status: error?.status,
            name: error?.name,
        });
        return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
    }

    const user = data.session.user;
    const email = user.email;
    if (!email) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=no_email`);
    }

    const displayName =
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        email.split("@")[0];

    // 감사 로그 — OAuth 인증이 성공한 시점을 기록.
    // 실패해도 로그인 자체는 계속 진행 (실패는 콘솔로만 보고).
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip =
        forwardedFor?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        null;
    const userAgent = req.headers.get("user-agent") || null;
    const { error: auditError } = await supabase.from("audit_logs").insert({
        email,
        action: "login_success",
        ip,
        user_agent: userAgent,
    });
    if (auditError) {
        console.error("[auth/callback] audit_logs insert failed:", auditError);
    }

    const { data: existing, error: selectError } = await supabase
        .from("players")
        .select("status")
        .eq("email", email)
        .maybeSingle();

    if (selectError) {
        console.error("[auth/callback] players select failed:", selectError);
        return NextResponse.redirect(`${origin}/login?error=db_error`);
    }

    if (existing) {
        switch (existing.status) {
            case "active":
                return NextResponse.redirect(`${origin}${nextPath}`);
            case "rejected":
                await supabase.auth.signOut();
                return NextResponse.redirect(`${origin}/login?error=rejected`);
            case "pending":
            default:
                return NextResponse.redirect(`${origin}/pending`);
        }
    }

    const { error: insertError } = await supabase.from("players").insert({
        email,
        name: displayName,
        status: "pending",
        team_id: null,
    });

    if (insertError) {
        console.error("[auth/callback] players insert failed:", insertError);
        return NextResponse.redirect(`${origin}/login?error=db_error`);
    }

    return NextResponse.redirect(`${origin}/pending`);
}
