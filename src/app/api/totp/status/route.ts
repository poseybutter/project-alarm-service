import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";

/** GET — TOTP 상태 확인: 팀 필수 여부 + 현재 유저 설정 여부 */
export async function GET(req: NextRequest) {
    const teamId = req.nextUrl.searchParams.get("teamId")?.trim();
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

    try {
        const svc = createServiceSupabaseClient();

        const [teamResult, identityResult] = await Promise.all([
            svc.from("teams").select("totp_required").eq("id", teamId).single(),
            loadNormalizedIdentity(svc, user.email),
        ]);

        if (teamResult.error) throw teamResult.error;
        const profileId = identityResult?.profile?.id;
        const teamRequiresTotp = teamResult.data?.totp_required ?? false;

        if (!profileId) {
            return NextResponse.json({
                teamRequiresTotp,
                userHasTotp: false,
                setupComplete: false,
            });
        }

        const { data: row, error: totpErr } = await svc
            .from("totp_secrets")
            .select("verified_at")
            .eq("profile_id", profileId)
            .eq("team_id", teamId)
            .maybeSingle();
        if (totpErr) throw totpErr;

        return NextResponse.json({
            teamRequiresTotp,
            userHasTotp: Boolean(row),
            setupComplete: Boolean(row?.verified_at),
        });
    } catch (error) {
        return internalErrorResponse("totp-status", error);
    }
}
