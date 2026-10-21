import { NextResponse, type NextRequest } from "next/server";
import {
    AdminApiError,
    hasAdminPermission,
    requireAdminSession,
} from "@/features/admin/server/adminRepository";
import { adminErrorResponse } from "@/features/admin/server/http";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import {
    decryptIntegrationToken,
    encryptIntegrationToken,
    isEncryptedIntegrationToken,
} from "@/infrastructure/security/tokenEncryption";
import {
    resolveTeamMember,
    listActiveTeamMembers,
} from "@/features/identity/server/identityRepository";
import { validateGoogleChatWebhookUrl as validateWebhookUrl } from "@/features/agents/server/teamWebhooks";

export async function GET() {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const service = createServiceSupabaseClient();
        const member = await resolveTeamMember(service, user.email, teamId);
        if (!member) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data, error } = await service
            .from("agent_member_webhooks")
            .select("webhook_url, updated_at")
            .eq("team_id", teamId)
            .eq("email", user.email)
            .maybeSingle();

        if (error) throw error;
        const ownWebhookUrl = decryptIntegrationToken(data?.webhook_url) ?? "";
        // 암호문은 매번 IV 가 달라 재암호화 결과를 비교하면 항상 달라진다.
        // 그 비교로는 요청마다 같은 행을 다시 쓰게 되므로, 평문으로 남은 값만 한 번 옮긴다.
        if (data?.webhook_url && !isEncryptedIntegrationToken(data.webhook_url)) {
            const { error: encryptionError } = await service
                .from("agent_member_webhooks")
                .update({
                    webhook_url: encryptIntegrationToken(ownWebhookUrl),
                    updated_at: new Date().toISOString(),
                })
                .eq("team_id", teamId)
                .eq("email", user.email);
            if (encryptionError) throw encryptionError;
        }

        if (await hasAdminPermission(teamId, "integrations.read")) {
            const [teamMembers, { data: hooks, error: hooksError }] =
                await Promise.all([
                    listActiveTeamMembers(service, teamId),
                    service
                        .from("agent_member_webhooks")
                        .select("member, email, webhook_url, updated_at")
                        .eq("team_id", teamId),
                ]);

            if (hooksError) throw hooksError;

            const hookByMember = new Map(
                (hooks ?? []).map((hook) => [hook.member, hook]),
            );

            return NextResponse.json({
                member: member.name,
                configured: Boolean(ownWebhookUrl),
                webhookUrl: "",
                updatedAt: data?.updated_at ?? null,
                members: teamMembers.map((m) => {
                    const hook = hookByMember.get(m.name);
                    return {
                        member: m.name,
                        email: m.email,
                        role: m.role,
                        configured: Boolean(hook?.webhook_url),
                        updatedAt: hook?.updated_at ?? null,
                    };
                }),
            });
        }

        return NextResponse.json({
            member: member.name,
            configured: Boolean(ownWebhookUrl),
            webhookUrl: "",
            updatedAt: data?.updated_at ?? null,
        });
    } catch (error) {
        // requireAdminSession 의 권한 오류는 사유가 곧 해결 방법이라 그대로 노출한다.
        if (error instanceof AdminApiError) return adminErrorResponse(error);
        return internalErrorResponse(
            "agent-webhook-get",
            error,
            "Webhook 설정을 불러오지 못했습니다.",
        );
    }
}

export async function PUT(req: NextRequest) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body: { webhookUrl?: string; member?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const webhookUrl = body.webhookUrl?.trim() ?? "";
    const validationError = validateWebhookUrl(webhookUrl);
    if (validationError) {
        return NextResponse.json({ message: validationError }, { status: 400 });
    }

    try {
        const service = createServiceSupabaseClient();
        const currentMember = await resolveTeamMember(service, user.email, teamId);
        if (!currentMember) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        // 다른 구성원 지정은 아래에서 integrations.manage 로 검증한다
        const targetMember = body.member?.trim() || currentMember.name;
        const isOwnWebhook = targetMember === currentMember.name;
        if (!isOwnWebhook) {
            await requireAdminSession(teamId, "integrations.manage");
        }

        const teamMembers = await listActiveTeamMembers(service, teamId);
        const targetPlayer = teamMembers.find((m) => m.name === targetMember) ?? null;

        if (!targetPlayer?.email) {
            return NextResponse.json(
                { message: "Target player not found" },
                { status: 404 },
            );
        }

        const { data, error } = await service
            .from("agent_member_webhooks")
            .upsert(
                {
                    team_id: teamId,
                    member: targetPlayer.name,
                    email: targetPlayer.email,
                    webhook_url: encryptIntegrationToken(webhookUrl),
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "team_id,email" },
            )
            .select("updated_at")
            .maybeSingle();

        if (error) throw error;

        return NextResponse.json({
            member: targetPlayer.name,
            configured: true,
            webhookUrl: "",
            updatedAt: data?.updated_at ?? null,
        });
    } catch (error) {
        // requireAdminSession 의 권한 오류는 사유가 곧 해결 방법이라 그대로 노출한다.
        if (error instanceof AdminApiError) return adminErrorResponse(error);
        return internalErrorResponse(
            "agent-webhook-put",
            error,
            "Webhook 설정을 저장하지 못했습니다.",
        );
    }
}

export async function DELETE(req: NextRequest) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let requestedMember = "";
    try {
        const body = (await req.json()) as { member?: unknown };
        requestedMember =
            typeof body.member === "string" ? body.member.trim() : "";
    } catch {
        // An empty DELETE body means the current member's webhook.
    }

    try {
        const service = createServiceSupabaseClient();
        const currentMember = await resolveTeamMember(service, user.email, teamId);
        if (!currentMember) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        // 다른 구성원 지정은 아래에서 integrations.manage 로 검증한다
        const targetMember = requestedMember || currentMember.name;
        if (targetMember !== currentMember.name) {
            await requireAdminSession(teamId, "integrations.manage");
        }

        const { error } = await service
            .from("agent_member_webhooks")
            .delete()
            .eq("team_id", teamId)
            .eq("member", targetMember);
        if (error) throw error;

        return NextResponse.json({ deleted: true, member: targetMember });
    } catch (error) {
        // requireAdminSession 의 권한 오류는 사유가 곧 해결 방법이라 그대로 노출한다.
        if (error instanceof AdminApiError) return adminErrorResponse(error);
        return internalErrorResponse(
            "agent-webhook-delete",
            error,
            "Webhook 설정을 삭제하지 못했습니다.",
        );
    }
}
