import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { hashPin } from "@/shared/server/pinHash";

type PinBody = {
    teamId?: string;
    pin?: string | null;
};

/** POST — 팀 세팅 PIN 설정/변경/해제 (admin만) */
export async function POST(req: NextRequest) {
    let body: PinBody;
    try {
        body = (await req.json()) as PinBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
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
    if (role !== "admin") {
        return NextResponse.json({ message: "관리자만 PIN을 설정할 수 있습니다." }, { status: 403 });
    }

    const pin = body.pin?.trim() ?? null;
    if (pin !== null && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
        return NextResponse.json(
            { message: "PIN은 4~6자리 숫자여야 합니다." },
            { status: 400 },
        );
    }

    try {
        const svc = createServiceSupabaseClient();
        const { error } = await svc
            .from("teams")
            .update({
                settings_pin_hash: pin ? hashPin(pin) : null,
                settings_pin_updated_at: new Date().toISOString(),
            })
            .eq("id", teamId);
        if (error) throw error;

        return NextResponse.json({ ok: true, hasPin: pin !== null });
    } catch (error) {
        return internalErrorResponse("pf-pin-set", error);
    }
}

/** GET — 팀 PIN 설정 여부 조회 */
export async function GET(req: NextRequest) {
    const teamId = req.nextUrl.searchParams.get("teamId")?.trim();
    if (!teamId) {
        return NextResponse.json({ message: "teamId is required" }, { status: 400 });
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const svc = createServiceSupabaseClient();
        const { data, error } = await svc
            .from("teams")
            .select("settings_pin_hash, settings_pin_updated_at")
            .eq("id", teamId)
            .maybeSingle();
        if (error) throw error;

        return NextResponse.json({
            hasPin: Boolean(data?.settings_pin_hash),
            updatedAt: data?.settings_pin_updated_at ?? null,
        });
    } catch (error) {
        return internalErrorResponse("pf-pin-get", error);
    }
}
