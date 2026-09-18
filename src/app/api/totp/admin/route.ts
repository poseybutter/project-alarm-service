import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";

type AdminBody = { teamId?: string; enabled?: boolean };

/** POST — 관리자 전용: 팀 TOTP 필수 여부 토글 */
export async function POST(req: NextRequest) {
    let body: AdminBody;
    try {
        body = (await req.json()) as AdminBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    if (!teamId || typeof body.enabled !== "boolean") {
        return NextResponse.json(
            { message: "teamId and enabled (boolean) are required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || role !== "admin") {
        return NextResponse.json({ message: "Admin access required" }, { status: 403 });
    }

    try {
        const svc = createServiceSupabaseClient();

        const { error } = await svc
            .from("teams")
            .update({ totp_required: body.enabled })
            .eq("id", teamId);

        if (error) throw error;

        return NextResponse.json({ ok: true, totp_required: body.enabled });
    } catch (error) {
        return internalErrorResponse("totp-admin", error);
    }
}
