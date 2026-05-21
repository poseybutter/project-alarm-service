import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

/** 팀 마스터 목록. /guild-join 폼의 팀 선택 드롭다운에서 사용. */
export async function GET() {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase
        .from("teams")
        .select("id, name, icon")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("[api/teams] select failed:", error);
        const isDev = process.env.NODE_ENV !== "production";
        return NextResponse.json(
            {
                message: "팀 목록을 불러오지 못했어요",
                ...(isDev && {
                    detail: error.message,
                    code: error.code,
                    hint: error.hint,
                }),
            },
            { status: 500 },
        );
    }
    return NextResponse.json(data ?? []);
}
