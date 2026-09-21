import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import {
    requestRateLimitKey,
    consumeRateLimit,
    rateLimitResponse,
} from "@/shared/server/rateLimit";
import { generateTotpSecret, getTotpUri } from "@/shared/server/totp";
import { encryptField } from "@/shared/server/fieldEncryption";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";
import QRCode from "qrcode";

type SetupBody = { teamId?: string };

/** POST — TOTP 셋업: 시크릿 생성 + QR data URL 반환 */
export async function POST(req: NextRequest) {
    let body: SetupBody;
    try {
        body = (await req.json()) as SetupBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
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

    const rl = consumeRateLimit(
        requestRateLimitKey(req, "totp-setup", `${teamId}:${user.email}`),
        { limit: 5, windowMs: 5 * 60 * 1000 },
    );
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

    try {
        const svc = createServiceSupabaseClient();

        // 프로필 조회
        const identity = await loadNormalizedIdentity(svc, user.email);
        const profileId = identity?.profile?.id;
        if (!profileId) {
            return NextResponse.json(
                { message: "Profile not found" },
                { status: 404 },
            );
        }

        // 이미 검증 완료된 TOTP가 있으면 거부
        const { data: existing, error: existErr } = await svc
            .from("totp_secrets")
            .select("id, verified_at")
            .eq("profile_id", profileId)
            .eq("team_id", teamId)
            .maybeSingle();
        if (existErr) throw existErr;

        if (existing?.verified_at) {
            return NextResponse.json(
                { message: "이미 TOTP가 설정되어 있습니다." },
                { status: 409 },
            );
        }

        // 팀 이름 조회
        const { data: team } = await svc
            .from("teams")
            .select("name")
            .eq("id", teamId)
            .single();

        const secret = generateTotpSecret();
        const uri = getTotpUri(secret, user.email, team?.name ?? teamId);
        const qrDataUrl = await QRCode.toDataURL(uri, { width: 256, margin: 2 });

        // upsert (미검증 상태로 재생성 허용)
        const { error: upsertErr } = await svc.from("totp_secrets").upsert(
            {
                profile_id: profileId,
                team_id: teamId,
                encrypted_secret: encryptField(secret),
                verified_at: null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "profile_id,team_id" },
        );
        if (upsertErr) throw upsertErr;

        return NextResponse.json({ qrDataUrl, secret });
    } catch (error) {
        return internalErrorResponse("totp-setup", error);
    }
}
