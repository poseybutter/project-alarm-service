import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { decryptField } from "@/shared/server/fieldEncryption";
import { validateVerifyToken } from "@/shared/server/pinToken";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";
import {
    requestRateLimitKey,
    consumeRateLimit,
    rateLimitResponse,
} from "@/shared/server/rateLimit";

type RevealBody = {
    teamId?: string;
    projectId?: number;
    fieldDefId?: number;
    /** 배치 모드 — 여러 필드를 한 번에 복호화 */
    fieldDefIds?: number[];
    /** TOTP verify에서 발급받은 HMAC 토큰 */
    totpToken?: string;
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

    // 인증
    const svc = createServiceSupabaseClient();

    const [authResult, teamResult] = await Promise.all([
        getServerUserRole(teamId),
        svc.from("teams").select("totp_required").eq("id", teamId).maybeSingle(),
    ]);

    const { user, role } = authResult;
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // rate limit — 인증 후, 유저별 키
    const rlKey = requestRateLimitKey(req, "secret-reveal", `${teamId}:${user.email}`);
    const rl = consumeRateLimit(rlKey, { limit: 10, windowMs: 5 * 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

    if (teamResult.error) throw teamResult.error;
    const totpRequired = teamResult.data?.totp_required ?? false;

    // TOTP 토큰 검증
    if (totpRequired) {
        const totpToken = body.totpToken?.trim();
        if (!totpToken) {
            return NextResponse.json(
                { message: "TOTP verification required" },
                { status: 403 },
            );
        }

        const identity = await loadNormalizedIdentity(svc, user.email);
        const profileId = identity?.profile?.id;
        if (!profileId || !validateVerifyToken(teamId, totpToken, profileId)) {
            return NextResponse.json(
                { message: "TOTP token invalid or expired" },
                { status: 403 },
            );
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
            if (auditRows.length > 0) {
                await svc.from("project_field_audit_logs").insert(auditRows);
            }
            return NextResponse.json({ values: result });
        }

        // ── 단건 모드 ──
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
