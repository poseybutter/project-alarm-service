import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { enforceTeamTotp } from "@/shared/server/totpGate";

const PAGE_SIZE = 30;
const VALID_ACTIONS = ["create", "update", "delete"] as const;
const MAX_LABEL_LENGTH = 100;
const MAX_VALUE_LENGTH = 10_000;
const MAX_ENTRIES = 50;

type HistoryEntry = {
    field_label: string;
    old_value: string | null;
    new_value: string | null;
    action: string;
};

type PostBody = {
    teamId?: string;
    projectId?: number;
    entries?: HistoryEntry[];
};

/** POST — 고정 필드 등의 변경 이력을 직접 기록 */
export async function POST(req: NextRequest) {
    let body: PostBody;
    try {
        body = (await req.json()) as PostBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    const projectId = body.projectId as number;
    const entries = body.entries;
    if (!teamId || !Number.isInteger(projectId) || !Array.isArray(entries) || !entries.length) {
        return NextResponse.json(
            { message: "teamId, projectId, entries are required" },
            { status: 400 },
        );
    }

    if (entries.length > MAX_ENTRIES) {
        return NextResponse.json(
            { message: `entries must not exceed ${MAX_ENTRIES} items` },
            { status: 400 },
        );
    }

    // 입력 검증
    for (const e of entries) {
        if (
            typeof e !== "object" ||
            e === null ||
            !(VALID_ACTIONS as readonly string[]).includes(e.action)
        ) {
            return NextResponse.json(
                { message: `Invalid action: ${e.action}` },
                { status: 400 },
            );
        }
        if (
            typeof e.field_label !== "string" ||
            !e.field_label ||
            e.field_label.length > MAX_LABEL_LENGTH
        ) {
            return NextResponse.json(
                { message: `field_label must be 1–${MAX_LABEL_LENGTH} characters` },
                { status: 400 },
            );
        }
        if (
            (e.old_value != null && typeof e.old_value !== "string") ||
            (e.new_value != null && typeof e.new_value !== "string")
        ) {
            return NextResponse.json(
                { message: "old_value/new_value must be strings" },
                { status: 400 },
            );
        }
        if (e.old_value && e.old_value.length > MAX_VALUE_LENGTH) {
            return NextResponse.json(
                { message: `old_value must not exceed ${MAX_VALUE_LENGTH} characters` },
                { status: 400 },
            );
        }
        if (e.new_value && e.new_value.length > MAX_VALUE_LENGTH) {
            return NextResponse.json(
                { message: `new_value must not exceed ${MAX_VALUE_LENGTH} characters` },
                { status: 400 },
            );
        }
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    // viewer 는 프로젝트를 수정할 수 없으므로 이력도 기록할 수 없다
    if (role === "viewer") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
        const svc = createServiceSupabaseClient();

        // 다른 팀 프로젝트에 이력을 남기지 못하도록 소속 확인
        const { data: project, error: projectErr } = await svc
            .from("projects")
            .select("id")
            .eq("id", projectId)
            .eq("team_id", teamId)
            .maybeSingle();
        if (projectErr) throw projectErr;
        if (!project) {
            return NextResponse.json({ message: "Project not found" }, { status: 404 });
        }

        const now = new Date().toISOString();
        const rows = entries.map((e) => ({
            team_id: teamId,
            project_id: projectId,
            field_def_id: 0,
            field_label: e.field_label.slice(0, MAX_LABEL_LENGTH),
            old_value: e.old_value?.slice(0, MAX_VALUE_LENGTH) ?? null,
            new_value: e.new_value?.slice(0, MAX_VALUE_LENGTH) ?? null,
            is_secret: false,
            action: e.action,
            changed_by: user.email!,
            changed_at: now,
        }));
        const { error } = await svc.from("project_field_history").insert(rows);
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (error) {
        return internalErrorResponse("pf-history-post", error);
    }
}

/** GET — 프로젝트의 변경 이력 (커서 페이지네이션) */
export async function GET(req: NextRequest) {
    const teamId = req.nextUrl.searchParams.get("teamId")?.trim();
    const projectId = req.nextUrl.searchParams.get("projectId")?.trim();
    const cursor = req.nextUrl.searchParams.get("cursor")?.trim();

    if (!teamId || !projectId || !Number.isInteger(Number(projectId))) {
        return NextResponse.json(
            { message: "teamId and projectId are required" },
            { status: 400 },
        );
    }
    if (cursor && !Number.isInteger(Number(cursor))) {
        return NextResponse.json({ message: "cursor must be a number" }, { status: 400 });
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const svc = createServiceSupabaseClient();

        // TOTP 필수 팀은 이력(일반 필드 값 포함)도 TOTP 잠금 대상
        const totpDenied = await enforceTeamTotp(svc, req, teamId, user.email);
        if (totpDenied) return totpDenied;

        let query = svc
            .from("project_field_history")
            .select("*")
            .eq("team_id", teamId)
            .eq("project_id", Number(projectId))
            .order("changed_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(PAGE_SIZE + 1);

        if (cursor) {
            query = query.lt("id", Number(cursor));
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = data ?? [];
        const hasMore = rows.length > PAGE_SIZE;
        const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
        const nextCursor = hasMore ? items[items.length - 1].id : null;

        // 필드 정의 label 붙이기
        const defIds = [...new Set(items.map((r) => r.field_def_id))];
        let defMap = new Map<number, string>();
        if (defIds.length > 0) {
            const { data: defs } = await svc
                .from("project_field_definitions")
                .select("id, label")
                .eq("team_id", teamId)
                .in("id", defIds);
            defMap = new Map(
                (defs ?? []).map((d) => [d.id, d.label]),
            );
        }

        const enriched = items.map((row) => ({
            ...row,
            field_label: row.field_label || defMap.get(row.field_def_id) || `필드 #${row.field_def_id}`,
        }));

        return NextResponse.json({ items: enriched, nextCursor });
    } catch (error) {
        return internalErrorResponse("pf-history-list", error);
    }
}
