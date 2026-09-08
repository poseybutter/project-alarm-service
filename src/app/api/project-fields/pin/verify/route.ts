import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { verifyPin } from "@/shared/server/pinHash";

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

        const ok = verifyPin(pin, data.settings_pin_hash);
        return NextResponse.json({ ok });
    } catch (error) {
        return internalErrorResponse("pf-pin-verify", error);
    }
}
