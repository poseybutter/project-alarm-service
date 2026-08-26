import "server-only";

import type {
    AgentSuggestion,
    AgentSuggestionStatus,
    AgentType,
    NewAgentSuggestion,
} from "./types";

export type SupabaseLike = {
    from: (table: string) => unknown;
};

type QueryError = {
    message: string;
};

type QueryResult<T> = {
    data: T;
    error: QueryError | null;
};

type QueryBuilder<T> = PromiseLike<QueryResult<T>> & {
    eq: (column: string, value: unknown) => QueryBuilder<T>;
    order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
    limit: (count: number) => QueryBuilder<T>;
    select: <Next = T>(columns?: string) => QueryBuilder<Next>;
    maybeSingle: () => PromiseLike<QueryResult<T>>;
};

type AgentSuggestionTable = {
    select: <T = AgentSuggestion[]>(columns?: string) => QueryBuilder<T>;
    insert: <T = AgentSuggestion[]>(values: unknown) => QueryBuilder<T>;
    upsert: <T = AgentSuggestion[]>(
        values: unknown,
        options?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => QueryBuilder<T>;
    update: <T = AgentSuggestion>(values: unknown) => QueryBuilder<T>;
};

function agentSuggestionTable(supabase: SupabaseLike) {
    return supabase.from("agent_suggestions") as AgentSuggestionTable;
}

function throwQueryError(error: QueryError | null) {
    if (error) throw new Error(error.message);
}

export async function listAgentSuggestions(
    supabase: SupabaseLike,
    params: {
        teamId: string;
        status?: AgentSuggestionStatus;
        agentType?: AgentType;
        limit?: number;
    },
): Promise<AgentSuggestion[]> {
    let query = agentSuggestionTable(supabase)
        .select("*")
        .eq("team_id", params.teamId)
        .order("created_at", { ascending: false })
        .limit(params.limit ?? 50);

    if (params.status) query = query.eq("status", params.status);
    if (params.agentType) query = query.eq("agent_type", params.agentType);

    const { data, error } = await query;
    throwQueryError(error);
    return (data ?? []) as AgentSuggestion[];
}

export async function createAgentSuggestions(
    supabase: SupabaseLike,
    suggestions: NewAgentSuggestion[],
): Promise<AgentSuggestion[]> {
    if (suggestions.length === 0) return [];

    const rows = suggestions.map((s) => ({
        ...s,
        status: s.status ?? "pending",
    }));

    const { data, error } = await agentSuggestionTable(supabase)
        .upsert(rows, {
            onConflict: "team_id,dedupe_key",
            ignoreDuplicates: true,
        })
        .select("*");

    throwQueryError(error);
    return (data ?? []) as AgentSuggestion[];
}

export async function updateAgentSuggestionStatus(
    supabase: SupabaseLike,
    params: {
        id: number;
        teamId: string;
        status: Exclude<AgentSuggestionStatus, "pending">;
        reviewedBy: string;
    },
): Promise<AgentSuggestion | null> {
    const { data, error } = await agentSuggestionTable(supabase)
        .update({
            status: params.status,
            reviewed_by: params.reviewedBy,
            reviewed_at: new Date().toISOString(),
        })
        .eq("id", params.id)
        .eq("team_id", params.teamId)
        .select("*")
        .maybeSingle();

    throwQueryError(error);
    return (data ?? null) as AgentSuggestion | null;
}
