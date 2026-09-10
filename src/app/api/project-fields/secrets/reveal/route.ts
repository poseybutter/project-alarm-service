import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { decryptField } from "@/shared/server/fieldEncryption";
import { verifyPin } from "@/shared/server/pinHash";
import {
    requestRateLimitKey,
    consumeSharedRateLimit,
    rateLimitResponse,
} from "@/shared/server/rateLimit";

type RevealBody = {
    teamId?: string;
    projectId?: number;
    fieldDefId?: number;
    /** 배치 모드 — 여러 필드를 한 번에 복호화 (PIN 검증 1회) */
    fieldDefIds?: number[];
    pin?: string;
};

/**
 * 팀 PIN 검증 — PIN이 설정되어 있으면 반드시 검증을 통과해야 한다.
 * 반환: null이면 통과, Response면 거부 응답.
 */
async function enforceTeamPin(
    svc: ReturnType<typeof createServiceSupabaseClient>,
    teamId: string,
    pin: string | undefined,
): Promise<NextResponse | null> {
    const { data: team, error } = await svc
        .from("teams")
        .select("settings_pin_hash")
        .eq("id", teamId)
        .maybeSingle();
    if (error) throw error;

    const hash = team?.settings_pin_hash;
    if (!hash) return null; // PIN 미설정 — 보호 비활성

    if (!pin) {
        return NextResponse.json({ message: "PIN is required" }, { status: 403 });
    }
    if (!verifyPin(pin, hash)) {
        return NextResponse.json({ message: "Invalid PIN" }, { status: 403 });
    }
    return null; // 검증 통과
}

/** POST — 암호화된 secret 필드 값을 복호화하여 반환 + 감사 로그 기록 */
export async function POST(req: NextRequest) {
    let body: RevealBody;
    try {
        body = (await req.json()) as RevealBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    if (teamId) {
        const rlKey = requestRateLimitKey(req, "secret-reveal", teamId);
        const rl = await consumeSharedRateLimit(rlKey, {
            limit: 10,
            windowMs: 5 * 60 * 1000,
            failClosed: true,
        });
        if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);
    }

    const projectId = body.projectId;
    const fieldDefId = body.fieldDefId;
    const fieldDefIds = body.fieldDefIds;
    const isBatch = Array.isArray(fieldDefIds) && fieldDefIds.length > 0;

    if (!teamId || !projectId || (!fieldDefId && !isBatch)) {
        return NextResponse.json(
            { message: "teamId, projectId, fieldDefId(s) are required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const svc = createServiceSupabaseClient();

        // PIN 검증 (1회)
        const pinDenied = await enforceTeamPin(svc, teamId, body.pin?.trim());
        if (pinDenied) return pinDenied;

        // ── 배치 모드 ──
        if (isBatch) {
            const ids = [...new Set(fieldDefIds)];
            const { data: rows, error } = await svc
                .from("project_field_values")
                .select("field_def_id, encrypted_value")
                .eq("team_id", teamId)
                .eq("project_id", projectId)
                .in("field_def_id", ids);
            if (error) throw error;

            const result: Record<number, string> = {};
            const auditRows: {
                team_id: string;
                project_id: number;
                field_def_id: number;
                action: string;
                actor_email: string;
            }[] = [];
            for (const row of rows ?? []) {
                if (!row.encrypted_value) continue;
                result[row.field_def_id] = decryptField(row.encrypted_value);
                auditRows.push({
                    team_id: teamId,
                    project_id: projectId,
                    field_def_id: row.field_def_id,
                    action: "view",
                    actor_email: user.email,
                });
            }
            if (auditRows.length > 0) {
                await svc.from("project_field_audit_logs").insert(auditRows);
            }
            return NextResponse.json({ values: result });
        }

        // ── 단건 모드 (기존 호환) ──
        const { data: row, error } = await svc
            .from("project_field_values")
            .select("encrypted_value")
            .eq("team_id", teamId)
            .eq("project_id", projectId)
            .eq("field_def_id", fieldDefId!)
            .maybeSingle();
        if (error) throw error;

        if (!row?.encrypted_value) {
            return NextResponse.json(
                { message: "Secret not found" },
                { status: 404 },
            );
        }

        // 복호화
        const plaintext = decryptField(row.encrypted_value);

        // 감사 로그 기록
        await svc.from("project_field_audit_logs").insert({
            team_id: teamId,
            project_id: projectId,
            field_def_id: fieldDefId!,
            action: "view",
            actor_email: user.email,
        });

        return NextResponse.json({ value: plaintext });
    } catch (error) {
        return internalErrorResponse("pf-secret-reveal", error);
    }
}
