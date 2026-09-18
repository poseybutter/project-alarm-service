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
    credentialId?: number;
    totpToken?: string;
};

/** POST — 팀원 자격증명 비밀번호 복호화 (TOTP 토큰 필요) */
export async function POST(req: NextRequest) {
    let body: RevealBody;
    try {
        body = (await req.json()) as RevealBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    const credentialId = body.credentialId;
    const totpToken = body.totpToken?.trim();
    if (!teamId || !credentialId) {
        return NextResponse.json(
            { message: "teamId and credentialId are required" },
            { status: 400 },
        );
    }

    const rlKey = requestRateLimitKey(req, "mc-reveal", teamId);
    const rl = consumeRateLimit(rlKey, { limit: 10, windowMs: 5 * 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const svc = createServiceSupabaseClient();

        // TOTP 토큰 검증
        const [teamResult, identity] = await Promise.all([
            svc.from("teams").select("totp_required").eq("id", teamId).single(),
            loadNormalizedIdentity(svc, user.email),
        ]);

        const totpRequired = teamResult.data?.totp_required ?? false;
        const profileId = identity?.profile?.id;

        if (totpRequired) {
            if (!totpToken || !profileId || !validateVerifyToken(teamId, totpToken, profileId)) {
                return NextResponse.json(
                    { message: "TOTP verification required" },
                    { status: 403 },
                );
            }
        }

        // 자격증명 조회 + 복호화
        const { data: row, error } = await svc
            .from("member_credentials")
            .select("encrypted_pw")
            .eq("id", credentialId)
            .eq("team_id", teamId)
            .maybeSingle();

        if (error) throw error;
        if (!row?.encrypted_pw) {
            return NextResponse.json(
                { message: "Password not found" },
                { status: 404 },
            );
        }

        const password = decryptField(row.encrypted_pw);

        // 감사 로그 — fire-and-forget
        void svc.from("member_credential_audit_logs").insert({
            team_id: teamId,
            credential_id: credentialId,
            action: "view",
            actor_email: user.email,
        });

        return NextResponse.json({ password });
    } catch (error) {
        return internalErrorResponse("mc-reveal", error);
    }
}
