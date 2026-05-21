import { NextResponse } from "next/server";
import { getSupabaseServer, requireAdmin } from "@/lib/supabaseServer";

/** PATCH /api/admin/players/[id]/approve — status='active' */
export async function PATCH(
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
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase
        .from("players")
        .update({ status: "active" })
        .eq("id", id)
        .select("id, name, email, status")
        .maybeSingle();

    if (error || !data) {
        console.error("[api/admin/players/approve] failed:", error);
        return NextResponse.json(
            { message: "승인 처리에 실패했어요." },
            { status: 500 },
        );
    }
    return NextResponse.json({ ok: true, player: data });
}
