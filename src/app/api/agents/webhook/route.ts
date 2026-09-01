import { NextResponse, type NextRequest } from "next/server";
import { requireAdminSession } from "@/features/admin/server/adminRepository";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import {
    decryptIntegrationToken,
    encryptIntegrationToken,
} from "@/infrastructure/security/tokenEncryption";
import {
    resolveTeamMember,
    listActiveTeamMembers,
} from "@/features/identity/server/identityRepository";

function validateWebhookUrl(value: string) {
    if (!value.trim()) return "Webhook URL is required";
    try {
        const url = new URL(value);
        const isGoogleChatWebhook =
            url.protocol === "https:" &&
            url.hostname === "chat.googleapis.com" &&
            !url.username &&
            !url.password &&
            (!url.port || url.port === "443") &&
            /^\/v1\/spaces\/[^/]+\/messages$/.test(url.pathname) &&
            Boolean(url.searchParams.get("key")) &&
            Boolean(url.searchParams.get("token"));
        if (isGoogleChatWebhook) return null;
    } catch {
        // The fixed validation message below is intentionally non-specific.
    }
    return "올바른 Google Chat Webhook URL을 입력해주세요.";
}

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
        const encryptedOwnWebhookUrl = encryptIntegrationToken(ownWebhookUrl);
        if (data?.webhook_url && encryptedOwnWebhookUrl !== data.webhook_url) {
            const { error: encryptionError } = await service
                .from("agent_member_webhooks")
                .update({
                    webhook_url: encryptedOwnWebhookUrl,
                    updated_at: new Date().toISOString(),
                })
                .eq("team_id", teamId)
                .eq("email", user.email);
            if (encryptionError) throw encryptionError;
        }

        if (role === "admin") {
            await requireAdminSession(teamId, "integrations.read");
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

        const targetMember =
            role === "admin" && body.member?.trim()
                ? body.member.trim()
                : currentMember.name;
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

        const targetMember =
            role === "admin" && requestedMember
                ? requestedMember
                : currentMember.name;
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
        return internalErrorResponse(
            "agent-webhook-delete",
            error,
            "Webhook 설정을 삭제하지 못했습니다.",
        );
    }
}
