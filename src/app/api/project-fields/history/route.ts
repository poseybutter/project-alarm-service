import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";

const PAGE_SIZE = 30;

type HistoryEntry = {
    field_label: string;
    old_value: string | null;
    new_value: string | null;
    is_secret?: boolean;
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
    const projectId = body.projectId;
    const entries = body.entries;
    if (!teamId || !projectId || !entries?.length) {
        return NextResponse.json(
            { message: "teamId, projectId, entries are required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const svc = createServiceSupabaseClient();
        const now = new Date().toISOString();
        const rows = entries.map((e) => ({
            team_id: teamId,
            project_id: projectId,
            field_def_id: 0,
            field_label: e.field_label,
            old_value: e.old_value,
            new_value: e.new_value,
            is_secret: e.is_secret ?? false,
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

    if (!teamId || !projectId) {
        return NextResponse.json(
            { message: "teamId and projectId are required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const svc = createServiceSupabaseClient();

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
