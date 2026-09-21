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
import { issueVerifyToken } from "@/shared/server/pinToken";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";

type VerifyBody = { teamId?: string; code?: string };

/** POST — 런타임 TOTP 검증: 코드 확인 후 HMAC 토큰 발급 */
export async function POST(req: NextRequest) {
    let body: VerifyBody;
    try {
        body = (await req.json()) as VerifyBody;
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

    // 유저별 rate limit — 한 사람의 실패가 다른 팀원에게 영향 주지 않도록
    const rlKey = requestRateLimitKey(req, "totp-verify", `${teamId}:${user.email}`);
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

        // 검증 완료된 TOTP 시크릿 조회
        const { data: row, error } = await svc
            .from("totp_secrets")
            .select("id, encrypted_secret")
            .eq("profile_id", profileId)
            .eq("team_id", teamId)
            .not("verified_at", "is", null)
            .maybeSingle();

        if (error) throw error;
        if (!row) {
            return NextResponse.json(
                { ok: false, message: "TOTP가 설정되지 않았습니다.", needSetup: true },
            );
        }

        const secret = decryptField(row.encrypted_secret);
        const ok = verifyTotpCode(secret, code);

        if (!ok) {
            return NextResponse.json({ ok: false, message: "코드가 올바르지 않습니다." });
        }

        const token = issueVerifyToken(teamId, profileId);
        return NextResponse.json({ ok: true, token });
    } catch (error) {
        return internalErrorResponse("totp-verify", error);
    }
}
