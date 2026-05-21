import { NextResponse } from "next/server";
import { getSupabaseServer, requireAdmin } from "@/lib/supabaseServer";

/**
 * DELETE /api/admin/teams/[id]
 * 관리자만. teams DELETE.
 * players 또는 invitations 가 참조 중이면 FK 위반(23503) → 409.
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
    if (!id) {
        return NextResponse.json(
            { message: "팀 ID 가 없어요." },
            { status: 400 },
        );
    }

    const supabase = await getSupabaseServer();
    const { error, count } = await supabase
        .from("teams")
        .delete({ count: "exact" })
        .eq("id", id);

    if (error) {
        if (error.code === "23503") {
            return NextResponse.json(
                {
                    message:
                        "이 팀에 소속된 멤버 또는 발급된 초대코드가 있어 삭제할 수 없어요.",
                },
                { status: 409 },
            );
        }
        console.error("[api/admin/teams/[id]] delete failed:", error);
        return NextResponse.json(
            { message: "팀 삭제에 실패했어요." },
            { status: 500 },
        );
    }
    if (!count) {
        return NextResponse.json(
            { message: "해당 팀을 찾을 수 없어요." },
            { status: 404 },
        );
    }
    return NextResponse.json({ ok: true });
}
