import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase OAuth (Google) 콜백.
 *
 * 이메일/도메인 화이트리스트 게이팅은 사용하지 않는다.
 * 누구든 구글 인증은 통과하고, players 테이블에 해당 이메일 행이 있는지로 권한을 판정한다.
 *
 * 1. PKCE code 를 세션으로 교환 (서버에서 처리해야 쿠키가 안정적으로 설정됨)
 * 2. audit_logs INSERT (login_success)
 * 3. players 테이블 조회 후 status 분기:
 *    - active   → /
 *    - pending  → /pending
 *    - rejected → /login?error=rejected
 * 4. players 에 없는 신규 OAuth 사용자 → /login?new=1
 *    (NotMemberModal → 초대코드 검증 → /guild-join 으로 가입 신청)
 */
export async function GET(req: NextRequest) {
    const { searchParams, origin } = new URL(req.url);
    const code = searchParams.get("code");

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
                return NextResponse.redirect(`${origin}/`);
            case "rejected":
                await supabase.auth.signOut();
                return NextResponse.redirect(`${origin}/login?error=rejected`);
            case "pending":
            default:
                return NextResponse.redirect(`${origin}/pending`);
        }
    }

    // players 에 없는 신규 OAuth 사용자 → 초대코드 모달로 유도.
    // (관리자 승인 플로우의 진입점이 /login?new=1 임)
    return NextResponse.redirect(`${origin}/login?new=1`);
}
