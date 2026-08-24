import { NextResponse, type NextRequest } from "next/server";
import { getServerUserRole } from "@/lib/serverSupabase";
import { internalErrorResponse } from "@/lib/server/apiResponse";

/**
 * 주간 브리핑 업무별 편집 내용(briefing_tasks) API.
 * - GET  /api/briefing-tasks?week=YYYY-MM-DD  → 해당 주에 저장된 업무별 편집 내용
 * - POST /api/briefing-tasks                  → { week, task_id, edited_content } upsert
 *
 * 인증/RLS: 로그인 세션을 먼저 확인하고, row 권한은 Supabase RLS에 맡긴다.
 */
export async function GET(req: NextRequest) {
    const teamId = req.nextUrl.searchParams.get("teamId")?.trim();
    if (!teamId) {
        return NextResponse.json(
            { message: "teamId is required" },
            { status: 400 },
        );
    }
    const { supabase, user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const week = req.nextUrl.searchParams.get("week");
    if (!week) {
        return NextResponse.json(
            { message: "week 파라미터가 필요해요." },
            { status: 400 },
        );
    }

    // 해당 주 briefings 행 조회 (없으면 저장된 내용도 없음)
    const { data: brief, error: bErr } = await supabase
        .from("briefings")
        .select("id")
        .eq("team_id", teamId)
        .eq("week_start", week)
        .maybeSingle();

    if (bErr) {
        return internalErrorResponse(
            "briefing-tasks-get-briefing",
            bErr,
            "브리핑을 불러오지 못했습니다.",
        );
    }
    if (!brief?.id) {
        return NextResponse.json({ tasks: [] });
    }

    const { data, error } = await supabase
        .from("briefing_tasks")
        .select("task_id, edited_content")
        .eq("team_id", teamId)
        .eq("briefing_id", brief.id);

    if (error) {
        return internalErrorResponse(
            "briefing-tasks-get",
            error,
            "브리핑 업무를 불러오지 못했습니다.",
        );
    }

    return NextResponse.json({ tasks: data ?? [] });
}

export async function POST(req: NextRequest) {
    let body: {
        week?: string;
        teamId?: string;
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
    const teamId = body.teamId?.trim();
    if (!week || !teamId || typeof task_id !== "number") {
        return NextResponse.json(
            { message: "week와 task_id가 필요해요." },
            { status: 400 },
        );
    }

    const { supabase, user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (role !== "admin" && role !== "member") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("id")
        .eq("id", task_id)
        .eq("team_id", teamId)
        .maybeSingle();
    if (taskError) {
        return internalErrorResponse(
            "briefing-tasks-load-task",
            taskError,
            "업무를 확인하지 못했습니다.",
        );
    }
    if (!task) {
        return NextResponse.json({ message: "Task not found in this team" }, { status: 404 });
    }

    // 이번 주 briefings 행 id 확보 (없으면 생성). week_start 유니크 기준 upsert.
    const { data: brief, error: bErr } = await supabase
        .from("briefings")
        .upsert(
            { week_start: week, team_id: teamId, is_locked: false },
            { onConflict: "team_id,week_start" },
        )
        .select("id")
        .maybeSingle();

    if (bErr || !brief?.id) {
        return internalErrorResponse(
            "briefing-tasks-upsert-briefing",
            bErr ?? new Error("briefing row missing"),
            "브리핑 행을 만들지 못했어요.",
        );
    }

    const { error } = await supabase.from("briefing_tasks").upsert(
        {
            briefing_id: brief.id,
            task_id,
            edited_content: edited_content ?? null,
            team_id: teamId,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "briefing_id,task_id" },
    );

    if (error) {
        return internalErrorResponse(
            "briefing-tasks-upsert",
            error,
            "브리핑 업무를 저장하지 못했습니다.",
        );
    }

    return NextResponse.json({ ok: true });
}
