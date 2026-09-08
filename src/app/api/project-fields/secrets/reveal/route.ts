import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { decryptField } from "@/shared/server/fieldEncryption";
import { verifyPin } from "@/shared/server/pinHash";

type RevealBody = {
    teamId?: string;
    projectId?: number;
    fieldDefId?: number;
    pin?: string;
};

/** POST — 암호화된 secret 필드 값을 복호화하여 반환 + 감사 로그 기록 */
export async function POST(req: NextRequest) {
    let body: RevealBody;
    try {
        body = (await req.json()) as RevealBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    const projectId = body.projectId;
    const fieldDefId = body.fieldDefId;
    if (!teamId || !projectId || !fieldDefId) {
        return NextResponse.json(
            { message: "teamId, projectId, fieldDefId are required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const svc = createServiceSupabaseClient();

        // PIN 검증: 팀에 PIN이 설정되어 있으면 요청에 PIN 필수
        const { data: team, error: teamError } = await svc
            .from("teams")
            .select("settings_pin_hash")
            .eq("id", teamId)
            .maybeSingle();
        if (teamError) throw teamError;

        if (team?.settings_pin_hash) {
            const pin = body.pin?.trim();
            if (!pin) {
                return NextResponse.json(
                    { message: "PIN is required" },
                    { status: 403 },
                );
            }
            if (!verifyPin(pin, team.settings_pin_hash)) {
                return NextResponse.json(
                    { message: "Invalid PIN" },
                    { status: 403 },
                );
            }
        }

        // 값 조회
        const { data: row, error } = await svc
            .from("project_field_values")
            .select("encrypted_value")
            .eq("team_id", teamId)
            .eq("project_id", projectId)
            .eq("field_def_id", fieldDefId)
            .maybeSingle();
        if (error) throw error;

        if (!row?.encrypted_value) {
            return NextResponse.json(
                { message: "Secret not found" },
                { status: 404 },
            );
        }

        // 복호화
        const plaintext = decryptField(row.encrypted_value);

        // 감사 로그 기록
        await svc.from("project_field_audit_logs").insert({
            team_id: teamId,
            project_id: projectId,
            field_def_id: fieldDefId,
            action: "view",
            actor_email: user.email,
        });

        return NextResponse.json({ value: plaintext });
    } catch (error) {
        return internalErrorResponse("pf-secret-reveal", error);
    }
}
