import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { TEAM_ID } from "@/lib/constants";

/**
 * 주간 브리핑 업무별 편집 내용(briefing_tasks) API.
 * - GET  /api/briefing-tasks?week=YYYY-MM-DD  → 해당 주에 저장된 업무별 편집 내용
 * - POST /api/briefing-tasks                  → { week, task_id, edited_content } upsert
 *
 * 인증/RLS: 기존 라우트와 동일하게 anon 키 + 세션 쿠키로 서버 클라이언트 생성.
 */
async function getClient() {
    const store = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        {
            cookies: {
                getAll() {
                    return store.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        store.set(name, value, options);
                    });
                },
            },
        },
    );
}

export async function GET(req: NextRequest) {
    const week = req.nextUrl.searchParams.get("week");
    if (!week) {
        return NextResponse.json(
            { message: "week 파라미터가 필요해요." },
            { status: 400 },
        );
    }

    const supabase = await getClient();

    // 해당 주 briefings 행 조회 (없으면 저장된 내용도 없음)
    const { data: brief, error: bErr } = await supabase
        .from("briefings")
        .select("id")
        .eq("team_id", TEAM_ID)
        .eq("week_start", week)
        .maybeSingle();

    if (bErr) {
        return NextResponse.json({ message: bErr.message }, { status: 500 });
    }
    if (!brief?.id) {
        return NextResponse.json({ tasks: [] });
    }

    const { data, error } = await supabase
        .from("briefing_tasks")
        .select("task_id, edited_content")
        .eq("team_id", TEAM_ID)
        .eq("briefing_id", brief.id);

    if (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ tasks: data ?? [] });
}

export async function POST(req: NextRequest) {
    let body: {
        week?: string;
        task_id?: number;
        edited_content?: string | null;
    };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { message: "잘못된 요청 본문이에요." },
            { status: 400 },
        );
    }

    const { week, task_id, edited_content } = body;
    if (!week || typeof task_id !== "number") {
        return NextResponse.json(
            { message: "week와 task_id가 필요해요." },
            { status: 400 },
        );
    }

    const supabase = await getClient();

    // 이번 주 briefings 행 id 확보 (없으면 생성). week_start 유니크 기준 upsert.
    const { data: brief, error: bErr } = await supabase
        .from("briefings")
        .upsert(
            { week_start: week, team_id: TEAM_ID, is_locked: false },
            { onConflict: "week_start" },
        )
        .select("id")
        .maybeSingle();

    if (bErr || !brief?.id) {
        return NextResponse.json(
            { message: bErr?.message ?? "브리핑 행을 만들지 못했어요." },
            { status: 500 },
        );
    }

    const { error } = await supabase.from("briefing_tasks").upsert(
        {
            briefing_id: brief.id,
            task_id,
            edited_content: edited_content ?? null,
            team_id: TEAM_ID,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "briefing_id,task_id" },
    );

    if (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
