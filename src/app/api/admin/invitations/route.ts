import { NextResponse } from "next/server";
import { getSupabaseServer, requireAdmin } from "@/lib/supabaseServer";

/** 8자리 코드 생성 — 혼동되는 문자(0/O, 1/I) 제외. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(): string {
    let s = "";
    for (let i = 0; i < 8; i++) {
        s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return s;
}

/**
 * GET /api/admin/invitations?status=active|used|expired|all (default all)
 */
export async function GET(req: Request) {
    const admin = await requireAdmin();
    if (!admin) {
        return NextResponse.json(
            { message: "관리자 권한이 필요해요." },
            { status: 403 },
        );
    }

    const status = new URL(req.url).searchParams.get("status") ?? "all";
    const supabase = await getSupabaseServer();
    const nowIso = new Date().toISOString();

    let query = supabase
        .from("invitations")
        .select(
            "id, code, team_id, issued_by, issued_at, expires_at, used, used_by, used_at",
        )
        .order("issued_at", { ascending: false });

    if (status === "active")
        query = query.eq("used", false).gt("expires_at", nowIso);
    else if (status === "used") query = query.eq("used", true);
    else if (status === "expired")
        query = query.eq("used", false).lte("expires_at", nowIso);

    const { data, error } = await query;
    if (error) {
        console.error("[api/admin/invitations] select failed:", error);
        return NextResponse.json(
            { message: "초대코드 목록을 불러오지 못했어요" },
            { status: 500 },
        );
    }
    return NextResponse.json(data ?? []);
}

/**
 * POST /api/admin/invitations
 * body: { teamId: string; expiresInDays: number }
 */
export async function POST(req: Request) {
    const admin = await requireAdmin();
    if (!admin) {
        return NextResponse.json(
            { message: "관리자 권한이 필요해요." },
            { status: 403 },
        );
    }

    let payload: { teamId?: unknown; expiresInDays?: unknown };
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json(
            { message: "요청 형식이 잘못되었어요." },
            { status: 400 },
        );
    }
    const teamId = String(payload.teamId ?? "").trim();
    const expiresInDaysRaw = Number(payload.expiresInDays ?? 7);
    const expiresInDays =
        Number.isFinite(expiresInDaysRaw) && expiresInDaysRaw > 0
            ? Math.min(Math.floor(expiresInDaysRaw), 90)
            : 7;
    if (!teamId) {
        return NextResponse.json(
            { message: "팀을 선택해 주세요." },
            { status: 400 },
        );
    }

    const supabase = await getSupabaseServer();
    const expiresAt = new Date(
        Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    // unique(code) 충돌 시 최대 5번 재시도
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = genCode();
        const { data, error } = await supabase
            .from("invitations")
            .insert({
                code,
                team_id: teamId,
                issued_by: admin.email,
                expires_at: expiresAt,
                used: false,
            })
            .select(
                "id, code, team_id, issued_by, issued_at, expires_at, used",
            )
            .maybeSingle();

        if (!error && data) {
            return NextResponse.json(data);
        }
        // 23505 = unique violation
        if (error && error.code !== "23505") {
            console.error("[api/admin/invitations] insert failed:", error);
            return NextResponse.json(
                { message: "초대코드 발급에 실패했어요." },
                { status: 500 },
            );
        }
    }

    return NextResponse.json(
        { message: "초대코드 발급 재시도 한도를 초과했어요." },
        { status: 500 },
    );
}
