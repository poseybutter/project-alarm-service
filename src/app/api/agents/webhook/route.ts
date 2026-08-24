import { NextResponse, type NextRequest } from "next/server";
import { getServerCurrentTeamRole } from "@/lib/serverSupabase";

function validateWebhookUrl(value: string) {
    if (!value.trim()) return "Webhook URL is required";
    if (!value.startsWith("https://chat.googleapis.com/")) {
        return "Google Chat webhook URL must start with https://chat.googleapis.com/";
    }
    return null;
}

async function getCurrentPlayer(
    supabase: Awaited<ReturnType<typeof getServerCurrentTeamRole>>["supabase"],
    email: string,
    teamId: string,
) {
    const { data, error } = await supabase
        .from("players")
        .select("name, role")
        .eq("team_id", teamId)
        .eq("email", email)
        .maybeSingle();

    if (error) throw error;
    return data;
}

export async function GET() {
    const { supabase, user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const player = await getCurrentPlayer(supabase, user.email, teamId);
        if (!player?.name) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data, error } = await supabase
            .from("agent_member_webhooks")
            .select("webhook_url, updated_at")
            .eq("team_id", teamId)
            .eq("email", user.email)
            .maybeSingle();

        if (error) throw error;

        if (player.role === "admin") {
            const [{ data: players, error: playersError }, { data: hooks, error: hooksError }] =
                await Promise.all([
                    supabase
                        .from("players")
                        .select("name, email, role")
                        .eq("team_id", teamId)
                        .order("name"),
                    supabase
                        .from("agent_member_webhooks")
                        .select("member, email, webhook_url, updated_at")
                        .eq("team_id", teamId),
                ]);

            if (playersError) throw playersError;
            if (hooksError) throw hooksError;

            const hookByMember = new Map(
                (hooks ?? []).map((hook) => [hook.member, hook]),
            );

            return NextResponse.json({
                member: player.name,
                configured: Boolean(data?.webhook_url),
                webhookUrl: data?.webhook_url ?? "",
                updatedAt: data?.updated_at ?? null,
                members: (players ?? []).map((row) => {
                    const hook = hookByMember.get(row.name);
                    return {
                        member: row.name,
                        email: row.email,
                        role: row.role,
                        configured: Boolean(hook?.webhook_url),
                        updatedAt: hook?.updated_at ?? null,
                    };
                }),
            });
        }

        return NextResponse.json({
            member: player.name,
            configured: Boolean(data?.webhook_url),
            webhookUrl: data?.webhook_url ?? "",
            updatedAt: data?.updated_at ?? null,
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to load webhook";
        return NextResponse.json({ message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const { supabase, user, role, teamId } = await getServerCurrentTeamRole();
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
        const player = await getCurrentPlayer(supabase, user.email, teamId);
        if (!player?.name) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const targetMember =
            player.role === "admin" && body.member?.trim()
                ? body.member.trim()
                : player.name;

        const { data: targetPlayer, error: targetError } = await supabase
            .from("players")
            .select("name, email")
            .eq("team_id", teamId)
            .eq("name", targetMember)
            .maybeSingle();

        if (targetError) throw targetError;
        if (!targetPlayer?.email) {
            return NextResponse.json(
                { message: "Target player not found" },
                { status: 404 },
            );
        }

        const { data, error } = await supabase
            .from("agent_member_webhooks")
            .upsert(
                {
                    team_id: teamId,
                    member: targetPlayer.name,
                    email: targetPlayer.email,
                    webhook_url: webhookUrl,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "team_id,email" },
            )
            .select("webhook_url, updated_at")
            .maybeSingle();

        if (error) throw error;

        return NextResponse.json({
            member: targetPlayer.name,
            configured: true,
            webhookUrl: data?.webhook_url ?? webhookUrl,
            updatedAt: data?.updated_at ?? null,
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to save webhook";
        return NextResponse.json({ message }, { status: 500 });
    }
}
