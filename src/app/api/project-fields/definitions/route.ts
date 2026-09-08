import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";

type DefBody = {
    teamId?: string;
    projectId?: number;
    id?: number;
    name?: string;
    label?: string;
    field_type?: string;
    sort_order?: number;
    is_required?: boolean;
    options?: unknown;
    reorder?: { id: number; sort_order: number }[];
};

const ALLOWED_TYPES = ["text", "url", "secret", "textarea", "select"];

function slugify(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_가-힣]/g, "");
}

/** GET — 프로젝트의 필드 정의 목록 */
export async function GET(req: NextRequest) {
    const teamId = req.nextUrl.searchParams.get("teamId")?.trim();
    const projectId = req.nextUrl.searchParams.get("projectId")?.trim();
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
        const { data, error } = await svc
            .from("project_field_definitions")
            .select("*")
            .eq("team_id", teamId)
            .eq("project_id", Number(projectId))
            .order("sort_order");
        if (error) throw error;

        return NextResponse.json(data ?? []);
    } catch (error) {
        return internalErrorResponse("pf-def-list", error);
    }
}

/** POST — 새 필드 정의 추가 (프로젝트별) */
export async function POST(req: NextRequest) {
    let body: DefBody;
    try {
        body = (await req.json()) as DefBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    const projectId = body.projectId;
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
    if (role === "viewer") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const label = body.label?.trim();
    if (!label) {
        return NextResponse.json(
            { message: "label is required" },
            { status: 400 },
        );
    }
    const fieldType = body.field_type ?? "text";
    if (!ALLOWED_TYPES.includes(fieldType)) {
        return NextResponse.json(
            { message: `Invalid field_type: ${fieldType}` },
            { status: 400 },
        );
    }

    const name = body.name?.trim() || slugify(label) || `field_${Date.now()}`;

    try {
        const svc = createServiceSupabaseClient();

        const { data: maxRow } = await svc
            .from("project_field_definitions")
            .select("sort_order")
            .eq("project_id", projectId)
            .order("sort_order", { ascending: false })
            .limit(1)
            .maybeSingle();
        const nextOrder = (maxRow?.sort_order ?? -1) + 1;

        const { data, error } = await svc
            .from("project_field_definitions")
            .insert({
                team_id: teamId,
                project_id: projectId,
                name,
                label,
                field_type: fieldType,
                sort_order: body.sort_order ?? nextOrder,
                is_required: body.is_required ?? false,
                options: body.options ?? null,
            })
            .select()
            .single();
        if (error) {
            if (error.code === "23505") {
                return NextResponse.json(
                    { message: "이미 같은 이름의 필드가 존재합니다." },
                    { status: 409 },
                );
            }
            throw error;
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        return internalErrorResponse("pf-def-create", error);
    }
}

/** PATCH — 필드 정의 수정 / 순서 일괄 변경 */
export async function PATCH(req: NextRequest) {
    let body: DefBody;
    try {
        body = (await req.json()) as DefBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    if (!teamId) {
        return NextResponse.json(
            { message: "teamId is required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (role === "viewer") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
        const svc = createServiceSupabaseClient();

        if (body.reorder && Array.isArray(body.reorder)) {
            const updates = body.reorder.map((item) =>
                svc
                    .from("project_field_definitions")
                    .update({
                        sort_order: item.sort_order,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", item.id)
                    .eq("team_id", teamId),
            );
            await Promise.all(updates);
            return NextResponse.json({ ok: true });
        }

        const id = body.id;
        if (!id) {
            return NextResponse.json(
                { message: "id is required" },
                { status: 400 },
            );
        }

        const patch: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };
        if (body.label !== undefined) patch.label = body.label.trim();
        if (body.name !== undefined) patch.name = body.name.trim();
        if (body.field_type !== undefined) {
            if (!ALLOWED_TYPES.includes(body.field_type)) {
                return NextResponse.json(
                    { message: `Invalid field_type: ${body.field_type}` },
                    { status: 400 },
                );
            }
            patch.field_type = body.field_type;
        }
        if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
        if (body.is_required !== undefined) patch.is_required = body.is_required;
        if (body.options !== undefined) patch.options = body.options;

        const { data, error } = await svc
            .from("project_field_definitions")
            .update(patch)
            .eq("id", id)
            .eq("team_id", teamId)
            .select()
            .single();
        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        return internalErrorResponse("pf-def-update", error);
    }
}

/** DELETE — 필드 정의 삭제 (관련 values, history도 cascade) */
export async function DELETE(req: NextRequest) {
    let body: DefBody;
    try {
        body = (await req.json()) as DefBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    const id = body.id;
    if (!teamId || !id) {
        return NextResponse.json(
            { message: "teamId and id are required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (role === "viewer") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
        const svc = createServiceSupabaseClient();
        const { error } = await svc
            .from("project_field_definitions")
            .delete()
            .eq("id", id)
            .eq("team_id", teamId);
        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (error) {
        return internalErrorResponse("pf-def-delete", error);
    }
}
