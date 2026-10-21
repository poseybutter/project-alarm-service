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
import {
    listActiveTeamMembers,
    resolveTeamMember,
} from "@/features/identity/server/identityRepository";
import {
    createAgentSuggestions,
    listAgentSuggestions,
} from "@/features/agents/server/suggestions";
import type {
    AgentSeverity,
    AgentSuggestionStatus,
    AgentType,
    NewAgentSuggestion,
} from "@/features/agents/server/types";

const AGENT_TYPES = new Set<AgentType>([
    "task_quality",
    "accessibility_reminder",
    "workload_balance",
    "notification",
]);

const SEVERITIES = new Set<AgentSeverity>([
    "info",
    "low",
    "medium",
    "high",
    "critical",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * 관리자가 보낸 제안 객체에서 허용한 필드만 골라낸다.
 * id·status·reviewed_* 같은 서버 관리 필드는 받지 않고, payload.channel 은
 * 서버가 수신자 유무로 정한다(수신자가 있으면 personal_dm, 없으면 team_room).
 */
function sanitizeSuggestionInput(
    item: unknown,
    params: { teamId: string; createdBy: string | null; memberNames: Set<string> },
): NewAgentSuggestion | null {
    if (!isPlainObject(item)) return null;

    const agentType = item.agent_type;
    if (typeof agentType !== "string" || !AGENT_TYPES.has(agentType as AgentType)) {
        return null;
    }
    const title = optionalString(item.title);
    const summary = typeof item.summary === "string" ? item.summary : null;
    if (!title || summary === null) return null;

    const severity =
        typeof item.severity === "string" &&
        SEVERITIES.has(item.severity as AgentSeverity)
            ? (item.severity as AgentSeverity)
            : "info";
    const targetId =
        typeof item.target_id === "number" && Number.isInteger(item.target_id)
            ? item.target_id
            : null;

    const rawPayload = isPlainObject(item.payload) ? item.payload : {};
    const recipientMember = optionalString(rawPayload.recipientMember);
    if (recipientMember && !params.memberNames.has(recipientMember)) return null;
    const payload: Record<string, unknown> = {
        ...rawPayload,
        channel: recipientMember ? "personal_dm" : "team_room",
    };
    if (recipientMember) payload.recipientMember = recipientMember;
    else delete payload.recipientMember;

    return {
        team_id: params.teamId,
        agent_type: agentType as AgentType,
        title,
        summary,
        severity,
        dedupe_key: optionalString(item.dedupe_key),
        target_table: optionalString(item.target_table),
        target_id: targetId,
        payload,
        evidence: isPlainObject(item.evidence) ? item.evidence : {},
        created_by: params.createdBy,
        status: "pending",
    };
}

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
    // 클라이언트가 준 값이므로 상한 없이 넘기면 테이블 크기만큼 읽게 된다.
    // 양의 정수만 허용하고, 그 외에는 기본값 50 으로 안전하게 되돌린다.
    const limit =
        Number.isInteger(limitParam) && limitParam > 0
            ? Math.min(limitParam, 200)
            : 50;

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
        const shouldShowTeam = role === "admin" && scopeParam === "team";

        let recipientMember: string | undefined;
        if (!shouldShowTeam && user.email) {
            const resolvedMember = await resolveTeamMember(service, user.email, teamId);
            const name = resolvedMember?.name ?? "";
            // 빈 문자열은 DB 필터를 비활성화하여 팀 전체 제안이 노출된다.
            // 이름을 확인할 수 없으면 빈 결과를 반환하는 것이 안전하다.
            if (!name) {
                return NextResponse.json({ suggestions: [] });
            }
            recipientMember = name;
        }

        const suggestions = await listAgentSuggestions(service, {
            teamId,
            status,
            agentType,
            recipientMember,
            limit,
        });

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
    try {
        await requireAdminSession(teamId, "integrations.manage");
    } catch (error) {
        if (error instanceof AdminApiError) return adminErrorResponse(error);
        return internalErrorResponse(
            "agent-suggestions-post-auth",
            error,
            "권한을 확인하지 못했습니다.",
        );
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
        const memberNames = new Set(
            (await listActiveTeamMembers(service, teamId)).map((m) => m.name),
        );
        const rows = suggestions.map((item) =>
            sanitizeSuggestionInput(item, {
                teamId,
                createdBy: user.email ?? null,
                memberNames,
            }),
        );
        if (rows.some((row) => row === null)) {
            return NextResponse.json(
                { message: "유효하지 않은 제안이 포함되어 있습니다." },
                { status: 400 },
            );
        }
        const created = await createAgentSuggestions(
            service,
            rows as NewAgentSuggestion[],
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
