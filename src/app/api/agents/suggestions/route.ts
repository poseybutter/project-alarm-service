import { NextResponse, type NextRequest } from "next/server";
import { internalErrorResponse } from "@/lib/server/apiResponse";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/lib/serverSupabase";
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
    const { user, role, teamId } = await getServerCurrentTeamRole();
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
        const service = createServiceSupabaseClient();
        let suggestions = await listAgentSuggestions(service, {
            teamId,
            status,
            agentType,
            limit: Number.isFinite(limitParam) ? limitParam : 50,
        });

        const shouldShowTeam = role === "admin" && scopeParam === "team";
        if (!shouldShowTeam && user.email) {
            const { data: player, error: playerError } = await service
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
    } catch (error) {
        return internalErrorResponse(
            "agent-suggestions-get",
            error,
            "에이전트 제안을 불러오지 못했습니다.",
        );
    }
}

export async function POST(req: NextRequest) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
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
        const service = createServiceSupabaseClient();
        const created = await createAgentSuggestions(
            service,
            suggestions.map((item) => ({
                ...(item as Record<string, unknown>),
                team_id: teamId,
                created_by: user.email ?? null,
            })) as Parameters<typeof createAgentSuggestions>[1],
        );
        return NextResponse.json({ suggestions: created }, { status: 201 });
    } catch (error) {
        return internalErrorResponse(
            "agent-suggestions-post",
            error,
            "에이전트 제안을 저장하지 못했습니다.",
        );
    }
}
