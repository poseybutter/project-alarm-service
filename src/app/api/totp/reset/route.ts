import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";

type ResetBody = {
    teamId?: string;
    targetProfileId?: string;
    targetEmail?: string;
};

/** POST — 관리자 전용: 특정 팀원의 TOTP 초기화 (분실 대비) */
export async function POST(req: NextRequest) {
    let body: ResetBody;
    try {
        body = (await req.json()) as ResetBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    const targetProfileId = body.targetProfileId?.trim();
    const targetEmail = body.targetEmail?.trim();
    if (!teamId || (!targetProfileId && !targetEmail)) {
        return NextResponse.json(
            { message: "teamId and (targetProfileId or targetEmail) are required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || role !== "admin") {
        return NextResponse.json({ message: "Admin access required" }, { status: 403 });
    }

    try {
        const svc = createServiceSupabaseClient();

        // email로 요청된 경우 profileId를 조회
        let profileId = targetProfileId;
        if (!profileId && targetEmail) {
            const identity = await loadNormalizedIdentity(svc, targetEmail);
            profileId = identity?.profile?.id;
            if (!profileId) {
                return NextResponse.json({ message: "Profile not found" }, { status: 404 });
            }
        }

        const { error } = await svc
            .from("totp_secrets")
            .delete()
            .eq("profile_id", profileId!)
            .eq("team_id", teamId);

        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (error) {
        return internalErrorResponse("totp-reset", error);
    }
}
