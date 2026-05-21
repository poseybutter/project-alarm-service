import { NextResponse } from "next/server";
import { getSupabaseServer, requireAdmin } from "@/lib/supabaseServer";

/**
 * POST /api/admin/teams
 * body: { id: string, name: string, icon?: string }
 * 관리자만. teams INSERT.
 */
export async function POST(req: Request) {
    const admin = await requireAdmin();
    if (!admin) {
        return NextResponse.json(
            { message: "관리자 권한이 필요해요." },
            { status: 403 },
        );
    }

    let payload: { id?: unknown; name?: unknown; icon?: unknown };
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json(
            { message: "요청 형식이 잘못되었어요." },
            { status: 400 },
        );
    }

    const id = String(payload.id ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "");
    const name = String(payload.name ?? "").trim();
    const icon = (() => {
        const v = String(payload.icon ?? "").trim();
        return v ? v : null;
    })();

    if (!id || id.length > 32) {
        return NextResponse.json(
            {
                message:
                    "팀 ID는 영문 소문자/숫자/하이픈/언더스코어로 1~32자여야 해요.",
            },
            { status: 400 },
        );
    }
    if (!name || name.length > 64) {
        return NextResponse.json(
            { message: "팀 이름을 1~64자로 입력해 주세요." },
            { status: 400 },
        );
    }

    const supabase = await getSupabaseServer();
    const { data, error } = await supabase
        .from("teams")
        .insert({ id, name, icon })
        .select("id, name, icon")
        .maybeSingle();

    if (error) {
        // 23505 = unique violation
        if (error.code === "23505") {
            return NextResponse.json(
                { message: "이미 같은 ID 의 팀이 있어요." },
                { status: 409 },
            );
        }
        console.error("[api/admin/teams] insert failed:", error);
        return NextResponse.json(
            { message: "팀 생성에 실패했어요." },
            { status: 500 },
        );
    }
    return NextResponse.json(data);
}
