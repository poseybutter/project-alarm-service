import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    getCurrentPlayer,
    getSupabaseServer,
} from "@/lib/supabaseServer";

/**
 * GET /api/admin/players?status=pending|active|rejected
 * 관리자 전용. status 필터 미지정 시 전체 반환.
 */
export async function GET(req: Request) {
    const player = await getCurrentPlayer();
    if (player?.role !== "admin") {
        const isDev = process.env.NODE_ENV !== "production";
        let diag: Record<string, unknown> | undefined;
        if (isDev) {
            // ① 이 라우트에 도착한 raw cookie — sb-* 인증 쿠키가 있는지가 핵심
            const store = await cookies();
            const allCookies = store.getAll();
            const sbAuthCookies = allCookies
                .filter(
                    (c) =>
                        c.name.startsWith("sb-") &&
                        c.name.includes("-auth-token"),
                )
                .map((c) => ({ name: c.name, length: c.value.length }));

            // ② supabase 세션 인식 여부
            const supabase = await getSupabaseServer();
            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            diag = {
                cookieCount: allCookies.length,
                cookieNames: allCookies.map((c) => c.name),
                sbAuthCookies,
                hasUser: !!user,
                email: user?.email ?? null,
                userError: userError?.message ?? null,
                player,
                role: player?.role ?? null,
            };
        }
        return NextResponse.json(
            { message: "관리자 권한이 필요해요.", ...(diag && { diag }) },
            { status: 403 },
        );
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const supabase = await getSupabaseServer();
    let query = supabase
        .from("players")
        .select(
            "id, name, email, team_id, status, role, bio, created_at",
        )
        .order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
        console.error("[api/admin/players] select failed:", error);
        const isDev = process.env.NODE_ENV !== "production";
        return NextResponse.json(
            {
                message: "신청자 목록을 불러오지 못했어요",
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
