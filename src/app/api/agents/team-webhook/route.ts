import { NextResponse, type NextRequest } from "next/server";
import {
    AdminApiError,
    requireAdminSession,
} from "@/features/admin/server/adminRepository";
import { adminErrorResponse } from "@/features/admin/server/http";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import { encryptIntegrationToken } from "@/infrastructure/security/tokenEncryption";
import { legacyTeamRoomWebhook } from "@/infrastructure/google-chat";
import { validateGoogleChatWebhookUrl } from "@/features/agents/server/teamWebhooks";

/** 팀 대화방 웹훅 등록 상태. 원문은 보안상 내려주지 않는다. */
export async function GET() {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        await requireAdminSession(teamId, "integrations.read");
        const service = createServiceSupabaseClient();
        const { data, error } = await service
            .from("agent_team_webhooks")
            .select("updated_at")
            .eq("team_id", teamId)
            .maybeSingle();
        if (error) throw error;

        return NextResponse.json({
            configured: Boolean(data),
            updatedAt: data?.updated_at ?? null,
            // 저장값이 없어도 레거시 팀은 전역 env 웹훅으로 발송된다.
            legacyFallback: !data && Boolean(legacyTeamRoomWebhook(teamId)),
        });
    } catch (error) {
        if (error instanceof AdminApiError) return adminErrorResponse(error);
        return internalErrorResponse(
            "agent-team-webhook-get",
            error,
            "팀 대화방 Webhook 설정을 불러오지 못했습니다.",
        );
    }
}

export async function PUT(req: NextRequest) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body: { webhookUrl?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const webhookUrl =
        typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
    const validationError = validateGoogleChatWebhookUrl(webhookUrl);
    if (validationError) {
        return NextResponse.json({ message: validationError }, { status: 400 });
    }

    try {
        await requireAdminSession(teamId, "integrations.manage");
        const service = createServiceSupabaseClient();
        const { data, error } = await service
            .from("agent_team_webhooks")
            .upsert(
                {
                    team_id: teamId,
                    webhook_url: encryptIntegrationToken(webhookUrl),
                    updated_by: user.email,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "team_id" },
            )
            .select("updated_at")
            .maybeSingle();
        if (error) throw error;

        return NextResponse.json({
            configured: true,
            updatedAt: data?.updated_at ?? null,
            legacyFallback: false,
        });
    } catch (error) {
        if (error instanceof AdminApiError) return adminErrorResponse(error);
        return internalErrorResponse(
            "agent-team-webhook-put",
            error,
            "팀 대화방 Webhook 설정을 저장하지 못했습니다.",
        );
    }
}

export async function DELETE() {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        await requireAdminSession(teamId, "integrations.manage");
        const service = createServiceSupabaseClient();
        const { error } = await service
            .from("agent_team_webhooks")
            .delete()
            .eq("team_id", teamId);
        if (error) throw error;

        return NextResponse.json({
            deleted: true,
            legacyFallback: Boolean(legacyTeamRoomWebhook(teamId)),
        });
    } catch (error) {
        if (error instanceof AdminApiError) return adminErrorResponse(error);
        return internalErrorResponse(
            "agent-team-webhook-delete",
            error,
            "팀 대화방 Webhook 설정을 삭제하지 못했습니다.",
        );
    }
}
