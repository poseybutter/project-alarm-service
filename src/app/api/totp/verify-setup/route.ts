import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import {
    requestRateLimitKey,
    consumeSharedRateLimit,
    rateLimitResponse,
} from "@/shared/server/rateLimit";
import { verifyTotpCode } from "@/shared/server/totp";
import { decryptField } from "@/shared/server/fieldEncryption";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";

type VerifySetupBody = { teamId?: string; code?: string };

/** POST — TOTP 셋업 검증: 첫 코드 확인 후 verified_at 설정 */
export async function POST(req: NextRequest) {
    let body: VerifySetupBody;
    try {
        body = (await req.json()) as VerifySetupBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!teamId || !code) {
        return NextResponse.json(
            { message: "teamId and code are required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const rlKey = requestRateLimitKey(req, "totp-verify-setup", `${teamId}:${user.email}`);
    const rl = await consumeSharedRateLimit(rlKey, {
        limit: 5,
        windowMs: 5 * 60 * 1000,
        failClosed: true,
    });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

    try {
        const svc = createServiceSupabaseClient();

        const identity = await loadNormalizedIdentity(svc, user.email);
        const profileId = identity?.profile?.id;
        if (!profileId) {
            return NextResponse.json(
                { message: "Profile not found" },
                { status: 404 },
            );
        }

        // 미검증 TOTP 시크릿 조회
        const { data: row, error } = await svc
            .from("totp_secrets")
            .select("id, encrypted_secret")
            .eq("profile_id", profileId)
            .eq("team_id", teamId)
            .is("verified_at", null)
            .maybeSingle();

        if (error) throw error;
        if (!row) {
            return NextResponse.json(
                { message: "TOTP 셋업을 먼저 진행해주세요." },
                { status: 404 },
            );
        }

        const secret = decryptField(row.encrypted_secret);
        const ok = verifyTotpCode(secret, code);

        if (!ok) {
            return NextResponse.json({ ok: false, message: "코드가 올바르지 않습니다." });
        }

        // 검증 완료
        const { error: updateErr } = await svc
            .from("totp_secrets")
            .update({ verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", row.id);
        if (updateErr) throw updateErr;

        return NextResponse.json({ ok: true });
    } catch (error) {
        return internalErrorResponse("totp-verify-setup", error);
    }
}
