import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { verifyPin } from "@/shared/server/pinHash";
import { issuePinToken } from "@/shared/server/pinToken";
import {
    requestRateLimitKey,
    consumeSharedRateLimit,
    rateLimitResponse,
} from "@/shared/server/rateLimit";

type VerifyBody = {
    teamId?: string;
    pin?: string;
};

/** POST — 팀 세팅 PIN 검증 */
export async function POST(req: NextRequest) {
    let body: VerifyBody;
    try {
        body = (await req.json()) as VerifyBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    const pin = body.pin?.trim();
    if (!teamId || !pin) {
        return NextResponse.json(
            { message: "teamId and pin are required" },
            { status: 400 },
        );
    }

    const svc = createServiceSupabaseClient();

    // rate limit + auth + PIN hash 조회를 병렬 실행
    const rlKey = requestRateLimitKey(req, "pin-verify", teamId);
    const [rl, authResult, teamResult] = await Promise.all([
        consumeSharedRateLimit(rlKey, {
            limit: 5,
            windowMs: 5 * 60 * 1000,
            failClosed: true,
        }),
        getServerUserRole(teamId),
        svc.from("teams").select("settings_pin_hash").eq("id", teamId).maybeSingle(),
    ]);

    if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

    const { user, role } = authResult;
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        if (teamResult.error) throw teamResult.error;

        if (!teamResult.data?.settings_pin_hash) {
            return NextResponse.json({ ok: true });
        }

        const hash = teamResult.data.settings_pin_hash;
        const ok = await verifyPin(pin, hash);
        // 검증 성공 시 단기 HMAC 토큰을 함께 반환 — reveal API에서 scrypt 재실행 불필요
        // 토큰에 PIN 해시 prefix를 포함하여 PIN 변경 시 자동 무효화
        const token = ok ? issuePinToken(teamId, hash) : undefined;
        return NextResponse.json({ ok, token });
    } catch (error) {
        return internalErrorResponse("pf-pin-verify", error);
    }
}
