import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

/**
 * 초대코드 검증.
 * - 형식: 8자, 영문 대문자/숫자 (입력단의 하이픈/공백/소문자 모두 정규화)
 * - DB: used=false, expires_at > now()
 * - 성공 시 5분 유효 ud2_invite 쿠키 발급 (HttpOnly) — /guild-join 진입 토큰
 *
 * 보안: 만료/없음/사용됨은 모두 같은 메시지 반환 (정보 누설 방어).
 */
const INVALID_RESPONSE = NextResponse.json(
    { valid: false, message: "유효하지 않은 초대코드입니다." },
    { status: 400 },
);

export async function POST(req: Request) {
    let payload: { code?: unknown };
    try {
        payload = await req.json();
    } catch {
        return INVALID_RESPONSE;
    }

    const raw = typeof payload.code === "string" ? payload.code : "";
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 8) return INVALID_RESPONSE;

    const supabase = await getSupabaseServer();
    const nowIso = new Date().toISOString();

    const { data: invitation, error } = await supabase
        .from("invitations")
        .select("id, team_id, expires_at, used")
        .eq("code", code)
        .maybeSingle();

    if (error) {
        console.error("[invitations/verify] select failed:", error);
        return INVALID_RESPONSE;
    }
    if (!invitation || invitation.used || invitation.expires_at <= nowIso) {
        return INVALID_RESPONSE;
    }

    const res = NextResponse.json({
        valid: true,
        teamId: invitation.team_id,
        invitationId: invitation.id,
    });
    // 5분 유효 임시 쿠키 — /guild-join에서 검증
    const isProd = process.env.NODE_ENV === "production";
    res.cookies.set("ud2_invite", String(invitation.id), {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: 300,
        path: "/",
    });
    return res;
}
