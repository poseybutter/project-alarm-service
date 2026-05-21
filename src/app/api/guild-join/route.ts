import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

/**
 * 길드 가입 제출.
 * - ud2_invite 쿠키 (invitations.id) 검증 → 유효한지 + 현재 사용 안 됨 + 만료 전
 * - players INSERT (status='pending')
 * - invitations UPDATE (used=true, used_by=email, used_at=now)
 * - 임시 쿠키 삭제
 */
export async function POST(req: Request) {
    const store = await cookies();
    const inviteIdRaw = store.get("ud2_invite")?.value;
    if (!inviteIdRaw) {
        return NextResponse.json(
            { error: "INVITE_REQUIRED", message: "초대코드 검증이 필요해요." },
            { status: 400 },
        );
    }
    const inviteId = Number(inviteIdRaw);
    if (!Number.isFinite(inviteId)) {
        return NextResponse.json(
            { error: "INVITE_REQUIRED", message: "초대코드 검증이 필요해요." },
            { status: 400 },
        );
    }

    let payload: { name?: unknown; teamId?: unknown; bio?: unknown };
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json(
            { error: "INVALID_INPUT", message: "요청 형식이 잘못되었어요." },
            { status: 400 },
        );
    }

    const name = String(payload.name ?? "").trim();
    const teamId = String(payload.teamId ?? "").trim();
    const bio = String(payload.bio ?? "").slice(0, 200);
    if (name.length < 2) {
        return NextResponse.json(
            { error: "INVALID_INPUT", message: "이름은 2자 이상 입력해 주세요." },
            { status: 400 },
        );
    }
    if (!teamId) {
        return NextResponse.json(
            { error: "INVALID_INPUT", message: "소속 팀을 선택해 주세요." },
            { status: 400 },
        );
    }

    const supabase = await getSupabaseServer();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
        return NextResponse.json(
            { error: "UNAUTHENTICATED", message: "다시 로그인해 주세요." },
            { status: 401 },
        );
    }

    // 초대코드 재검증 (쿠키 위조 방어)
    const { data: invitation, error: invSelErr } = await supabase
        .from("invitations")
        .select("id, team_id, expires_at, used")
        .eq("id", inviteId)
        .maybeSingle();
    if (invSelErr || !invitation) {
        return NextResponse.json(
            { error: "INVITE_INVALID", message: "유효하지 않은 초대코드입니다." },
            { status: 400 },
        );
    }
    if (invitation.used || invitation.expires_at <= new Date().toISOString()) {
        return NextResponse.json(
            { error: "INVITE_INVALID", message: "유효하지 않은 초대코드입니다." },
            { status: 400 },
        );
    }

    // players INSERT — 본인 행 + status=pending 만 허용하는 RLS와 일치
    const { error: insertError } = await supabase.from("players").insert({
        email: user.email,
        name,
        team_id: teamId,
        bio: bio || null,
        status: "pending",
    });
    if (insertError) {
        console.error("[api/guild-join] players insert failed:", insertError);
        return NextResponse.json(
            {
                error: "JOIN_FAILED",
                message: "가입 신청에 실패했어요. 잠시 후 다시 시도해 주세요.",
            },
            { status: 500 },
        );
    }

    // invitations UPDATE — 1회용 소진
    const { error: updError } = await supabase
        .from("invitations")
        .update({
            used: true,
            used_by: user.email,
            used_at: new Date().toISOString(),
        })
        .eq("id", inviteId);
    if (updError) {
        console.error("[api/guild-join] invitations update failed:", updError);
        // 플레이어는 이미 만들어진 상태 — 흐름은 계속
    }

    // 임시 쿠키 폐기 (1회용)
    const res = NextResponse.json({ ok: true });
    res.cookies.set("ud2_invite", "", { path: "/", maxAge: 0 });
    return res;
}
