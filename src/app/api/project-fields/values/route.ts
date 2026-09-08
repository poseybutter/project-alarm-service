import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { encryptField } from "@/shared/server/fieldEncryption";

type FieldEntry = {
    field_def_id: number;
    value: string | null;
};

type ValuesBody = {
    teamId?: string;
    projectId?: number;
    fields?: FieldEntry[];
};

/** GET — 프로젝트(들)의 필드 값 목록 */
export async function GET(req: NextRequest) {
    const teamId = req.nextUrl.searchParams.get("teamId")?.trim();
    const projectId = req.nextUrl.searchParams.get("projectId")?.trim();
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

    try {
        const svc = createServiceSupabaseClient();

        // NOTE: PIN 검증은 secrets/reveal 엔드포인트에서 수행.
        // values GET은 secret 값을 마스킹(has_secret:true, value:null)해서 반환하므로
        // PIN 없이 호출해도 민감 정보가 노출되지 않음.

        let query = svc
            .from("project_field_values")
            .select("id, project_id, field_def_id, value, encrypted_value, updated_at")
            .eq("team_id", teamId);

        if (projectId) {
            const pid = Number(projectId);
            if (Number.isNaN(pid)) {
                return NextResponse.json(
                    { message: "projectId must be a number" },
                    { status: 400 },
                );
            }
            query = query.eq("project_id", pid);
        }

        const { data, error } = await query;
        if (error) throw error;

        // encrypted_value가 있으면 마스킹 처리, 원문은 보내지 않음
        const masked = (data ?? []).map((row) => ({
            id: row.id,
            project_id: row.project_id,
            field_def_id: row.field_def_id,
            value: row.encrypted_value ? null : row.value,
            has_secret: Boolean(row.encrypted_value),
            updated_at: row.updated_at,
        }));

        return NextResponse.json(masked);
    } catch (error) {
        return internalErrorResponse("pf-val-list", error);
    }
}

/** PUT — 프로젝트의 필드 값 일괄 저장 (변경 이력 자동 기록) */
export async function PUT(req: NextRequest) {
    let body: ValuesBody;
    try {
        body = (await req.json()) as ValuesBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    const projectId = body.projectId;
    const fields = body.fields;
    if (!teamId || !projectId || !fields || !Array.isArray(fields)) {
        return NextResponse.json(
            { message: "teamId, projectId, fields are required" },
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
        const now = new Date().toISOString();

        // 1. 필드 정의 조회 (secret 여부 판별용 + 프로젝트 소유권 검증)
        const defIds = fields.map((f) => f.field_def_id);
        const { data: defs, error: defError } = await svc
            .from("project_field_definitions")
            .select("id, field_type, label")
            .eq("team_id", teamId)
            .eq("project_id", projectId)
            .in("id", defIds);
        if (defError) throw defError;

        const defMap = new Map(
            (defs ?? []).map((d) => [d.id, d]),
        );

        // 2. 기존 값 조회 (diff 비교용)
        const { data: existing, error: exError } = await svc
            .from("project_field_values")
            .select("id, field_def_id, value, encrypted_value")
            .eq("team_id", teamId)
            .eq("project_id", projectId)
            .in("field_def_id", defIds);
        if (exError) throw exError;

        const existingMap = new Map(
            (existing ?? []).map((e) => [e.field_def_id, e]),
        );

        // 3. 각 필드별 upsert + history 기록
        // NOTE: 필드를 순차적으로 처리하는 이유 — secret 필드는 이전 값 존재 여부에 따라
        // 분기(skip/encrypt/null)가 다르고, 동일 project_id+field_def_id 에 대한
        // upsert 를 병렬로 보내면 race condition 이 발생한다. 필드 수가 팀당 수십 개
        // 수준이므로 직렬 처리의 latency 영향은 미미하다.
        const historyRows: {
            team_id: string;
            project_id: number;
            field_def_id: number;
            old_value: string | null;
            new_value: string | null;
            is_secret: boolean;
            action: string;
            changed_by: string;
            changed_at: string;
        }[] = [];

        for (const field of fields) {
            const def = defMap.get(field.field_def_id);
            if (!def) continue;

            const isSecret = def.field_type === "secret";
            const prev = existingMap.get(field.field_def_id);
            const newVal = field.value?.trim() ?? null;

            // 변경 감지
            let changed = false;
            if (!prev) {
                // 새로 생성
                if (newVal) changed = true;
            } else if (isSecret) {
                // secret은 새 값이 들어오면 항상 변경으로 처리
                if (newVal) changed = true;
            } else {
                changed = (prev.value ?? "") !== (newVal ?? "");
            }

            // upsert
            const row: Record<string, unknown> = {
                team_id: teamId,
                project_id: projectId,
                field_def_id: field.field_def_id,
                updated_at: now,
            };

            if (isSecret && newVal) {
                row.value = null;
                row.encrypted_value = encryptField(newVal);
            } else if (isSecret && !newVal && prev) {
                // secret 필드에 빈 값이 들어오면 기존 암호화 값을 유지한다.
                // (클라이언트는 "빈칸이면 기존 값 유지"로 안내)
                continue;
            } else {
                row.value = newVal;
                row.encrypted_value = null;
            }

            if (prev) {
                await svc
                    .from("project_field_values")
                    .update(row)
                    .eq("id", prev.id);
            } else if (newVal) {
                row.created_at = now;
                await svc.from("project_field_values").insert(row);
            }

            // history 기록
            if (changed) {
                historyRows.push({
                    team_id: teamId,
                    project_id: projectId,
                    field_def_id: field.field_def_id,
                    old_value: isSecret
                        ? (prev ? "●●●(이전 값)" : null)
                        : (prev?.value ?? null),
                    new_value: isSecret ? "●●●(변경됨)" : newVal,
                    is_secret: isSecret,
                    action: prev ? "update" : "create",
                    changed_by: user.email!,
                    changed_at: now,
                });
            }
        }

        // 4. history 일괄 삽입
        if (historyRows.length > 0) {
            const { error: histErr } = await svc
                .from("project_field_history")
                .insert(historyRows);
            if (histErr) throw histErr;
        }

        return NextResponse.json({ ok: true, changedCount: historyRows.length });
    } catch (error) {
        return internalErrorResponse("pf-val-save", error);
    }
}
