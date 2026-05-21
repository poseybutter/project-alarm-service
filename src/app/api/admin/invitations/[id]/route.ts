import { NextResponse } from "next/server";
import { getSupabaseServer, requireAdmin } from "@/lib/supabaseServer";

/**
 * DELETE /api/admin/invitations/[id]
 * 관리자만. invitations 테이블에서 해당 id 폐기.
 *
 * 404 가 의외로 RLS DELETE 정책 누락에서 자주 나온다.
 *   - PostgreSQL RLS 는 명시적 FOR DELETE 정책이 없으면 거부 → 0 rows affected
 *   - count=0 이라도 그게 "행이 없어서" 인지 "RLS 거부" 인지 구분 못 함
 * 따라서 DELETE 전에 SELECT 로 행 존재 여부를 먼저 확인하고 404 / 500 을 분기한다.
 */
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const admin = await requireAdmin();
    if (!admin) {
        return NextResponse.json(
            { message: "관리자 권한이 필요해요." },
            { status: 403 },
        );
    }

    const { id } = await params;
    // invitations.id 는 bigint 인데 JS Number 안전 범위(2^53) 안에서 운영되므로 Number 변환 OK.
    // 큰 값은 PostgREST 가 자동 직렬화 처리.
    const numId = Number(id);
    if (!id || !Number.isFinite(numId) || numId <= 0) {
        return NextResponse.json(
            { message: "잘못된 초대코드 ID 입니다.", id },
            { status: 400 },
        );
    }

    const supabase = await getSupabaseServer();

    // 1) 행 존재 여부 확인 (SELECT RLS 는 모두 허용이라 admin 도 OK)
    const { data: existing, error: selErr } = await supabase
        .from("invitations")
        .select("id, code")
        .eq("id", numId)
        .maybeSingle();

    if (selErr) {
        console.error(
            "[api/admin/invitations/[id]] select before delete failed:",
            selErr,
        );
        const isDev = process.env.NODE_ENV !== "production";
        return NextResponse.json(
            {
                message: "초대코드 조회에 실패했어요.",
                ...(isDev && { detail: selErr.message, code: selErr.code }),
            },
            { status: 500 },
        );
    }
    if (!existing) {
        return NextResponse.json(
            { message: "해당 초대코드를 찾을 수 없어요." },
            { status: 404 },
        );
    }

    // 2) 실제 DELETE
    const { error: delErr, count } = await supabase
        .from("invitations")
        .delete({ count: "exact" })
        .eq("id", numId);

    if (delErr) {
        console.error(
            "[api/admin/invitations/[id]] delete failed:",
            delErr,
        );
        const isDev = process.env.NODE_ENV !== "production";
        return NextResponse.json(
            {
                message: "초대코드 폐기에 실패했어요.",
                ...(isDev && { detail: delErr.message, code: delErr.code }),
            },
            { status: 500 },
        );
    }
    // count=0 이지만 SELECT 로 행 존재 확인 → RLS DELETE 정책 미설정이 거의 확정
    if (!count) {
        const isDev = process.env.NODE_ENV !== "production";
        console.error(
            "[api/admin/invitations/[id]] 0 rows affected — likely missing RLS DELETE policy on 'invitations'",
        );
        return NextResponse.json(
            {
                message: "초대코드 폐기에 실패했어요.",
                ...(isDev && {
                    hint: "invitations 테이블에 FOR DELETE RLS 정책이 없을 가능성. db/V5_invitations_teams.sql 의 'invitations delete admin' 정책 적용 여부 확인",
                }),
            },
            { status: 500 },
        );
    }
    return NextResponse.json({ ok: true });
}
