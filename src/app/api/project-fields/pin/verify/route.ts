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

    // Rate limit: 5 attempts per 5 minutes per team
    const rlKey = requestRateLimitKey(req, "pin-verify", teamId);
    const rl = await consumeSharedRateLimit(rlKey, {
        limit: 5,
        windowMs: 5 * 60 * 1000,
        failClosed: true,
    });
    if (!rl.allowed) {
        return rateLimitResponse(rl.retryAfterSeconds);
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const svc = createServiceSupabaseClient();
        const { data, error } = await svc
            .from("teams")
            .select("settings_pin_hash")
            .eq("id", teamId)
            .maybeSingle();
        if (error) throw error;

        if (!data?.settings_pin_hash) {
            return NextResponse.json({ ok: true });
        }

        const ok = await verifyPin(pin, data.settings_pin_hash);
        // 검증 성공 시 단기 HMAC 토큰을 함께 반환 — reveal API에서 scrypt 재실행 불필요
        const token = ok ? issuePinToken(teamId) : undefined;
        return NextResponse.json({ ok, token });
    } catch (error) {
        return internalErrorResponse("pf-pin-verify", error);
    }
}
