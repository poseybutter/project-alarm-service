import { NextResponse, type NextRequest } from "next/server";
import { getServerCurrentTeamRole } from "@/lib/serverSupabase";
import {
    createAgentSuggestions,
    listAgentSuggestions,
} from "@/lib/agents/suggestions";
import type { AgentSuggestionStatus, AgentType } from "@/lib/agents/types";

const AGENT_TYPES = new Set<AgentType>([
    "task_quality",
    "accessibility_reminder",
    "workload_balance",
    "notification",
]);

const STATUSES = new Set<AgentSuggestionStatus>([
    "pending",
    "approved",
    "dismissed",
    "applied",
]);

export async function GET(req: NextRequest) {
    const { supabase, user, role, teamId } = await getServerCurrentTeamRole();
    if (!user || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const statusParam = req.nextUrl.searchParams.get("status");
    const agentTypeParam = req.nextUrl.searchParams.get("agentType");
    const scopeParam = req.nextUrl.searchParams.get("scope");
    const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 50);

    const status =
        statusParam && STATUSES.has(statusParam as AgentSuggestionStatus)
            ? (statusParam as AgentSuggestionStatus)
            : undefined;
    const agentType =
        agentTypeParam && AGENT_TYPES.has(agentTypeParam as AgentType)
            ? (agentTypeParam as AgentType)
            : undefined;

    try {
        let suggestions = await listAgentSuggestions(supabase, {
            teamId,
            status,
            agentType,
            limit: Number.isFinite(limitParam) ? limitParam : 50,
        });

        const shouldShowTeam = role === "admin" && scopeParam === "team";
        if (!shouldShowTeam && user.email) {
            const { data: player, error: playerError } = await supabase
                .from("players")
                .select("name")
                .eq("team_id", teamId)
                .eq("email", user.email)
                .maybeSingle();

            if (playerError) throw playerError;
            const memberName = player?.name ?? "";
            suggestions = suggestions.filter((suggestion) => {
                const recipient = suggestion.payload?.recipientMember;
                return recipient === memberName;
            });
        }

        return NextResponse.json({ suggestions });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to load suggestions";
        return NextResponse.json({ message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const { supabase, user, role, teamId } = await getServerCurrentTeamRole();
    if (!user || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (role !== "admin") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const suggestions =
        body &&
        typeof body === "object" &&
        "suggestions" in body &&
        Array.isArray((body as { suggestions?: unknown }).suggestions)
            ? (body as { suggestions: unknown[] }).suggestions
            : null;

    if (!suggestions) {
        return NextResponse.json(
            { message: "suggestions array is required" },
            { status: 400 },
        );
    }

    try {
        const created = await createAgentSuggestions(
            supabase,
            suggestions.map((item) => ({
                ...(item as Record<string, unknown>),
                team_id: teamId,
                created_by: user.email ?? null,
            })) as Parameters<typeof createAgentSuggestions>[1],
        );
        return NextResponse.json({ suggestions: created }, { status: 201 });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to create suggestions";
        return NextResponse.json({ message }, { status: 500 });
    }
}
