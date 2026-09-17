import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { decryptField } from "@/shared/server/fieldEncryption";
import { verifyPin } from "@/shared/server/pinHash";
import { validatePinToken } from "@/shared/server/pinToken";
import {
    requestRateLimitKey,
    consumeRateLimit,
    rateLimitResponse,
} from "@/shared/server/rateLimit";

type RevealBody = {
    teamId?: string;
    projectId?: number;
    fieldDefId?: number;
    /** 배치 모드 — 여러 필드를 한 번에 복호화 (PIN 검증 1회) */
    fieldDefIds?: number[];
    pin?: string;
    /** PIN verify에서 발급받은 HMAC 토큰 — scrypt 재실행 없이 빠르게 인가 */
    pinToken?: string;
};

/** POST — 암호화된 secret 필드 값을 복호화하여 반환 + 감사 로그 기록 */
export async function POST(req: NextRequest) {
    let body: RevealBody;
    try {
        body = (await req.json()) as RevealBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
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

    // Rate limit — 인메모리 전용 (PIN 토큰이 이미 5분 TTL + 팀 단위 제한이므로 DB RPC 불필요)
    const rlKey = requestRateLimitKey(req, "secret-reveal", teamId);
    const rl = consumeRateLimit(rlKey, { limit: 10, windowMs: 5 * 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

    const svc = createServiceSupabaseClient();

    // auth + PIN 검증을 병렬 실행 (각각 독립적인 DB 쿼리)
    const [authResult, teamResult] = await Promise.all([
        getServerUserRole(teamId),
        svc.from("teams").select("settings_pin_hash").eq("id", teamId).maybeSingle(),
    ]);

    const { user, role } = authResult;
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (teamResult.error) throw teamResult.error;
    const pinHash = teamResult.data?.settings_pin_hash;

    // PIN 검증 — pinToken이 있으면 HMAC만 확인 (CPU만, DB 호출 없음)
    if (pinHash) {
        const pinToken = body.pinToken?.trim();
        if (pinToken && validatePinToken(teamId, pinToken, pinHash)) {
            // 토큰 유효 — 통과
        } else {
            const pin = body.pin?.trim();
            if (!pin) {
                return NextResponse.json({ message: "PIN is required" }, { status: 403 });
            }
            if (!(await verifyPin(pin, pinHash))) {
                return NextResponse.json({ message: "Invalid PIN" }, { status: 403 });
            }
        }
    }

    try {
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
            // 감사 로그는 응답을 차단하지 않도록 비동기 fire-and-forget
            if (auditRows.length > 0) {
                void svc.from("project_field_audit_logs").insert(auditRows);
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

        const plaintext = decryptField(row.encrypted_value);

        // 감사 로그 — fire-and-forget
        void svc.from("project_field_audit_logs").insert({
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
