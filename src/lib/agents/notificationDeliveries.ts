import type { AgentSuggestion, NotificationSuggestionPayload } from "./types";
import type { SupabaseLike } from "./suggestions";

export const DEFAULT_NOTIFICATION_COOLDOWN_HOURS = 24;

type QueryError = {
    message: string;
};

type QueryResult<T> = {
    data: T;
    error: QueryError | null;
};

type QueryBuilder<T> = PromiseLike<QueryResult<T>> & {
    eq: (column: string, value: unknown) => QueryBuilder<T>;
    gte: (column: string, value: unknown) => QueryBuilder<T>;
    limit: (count: number) => QueryBuilder<T>;
    select: <Next = T>(columns?: string) => QueryBuilder<Next>;
};

type AgentNotificationDeliveryTable = {
    select: <T = { id: number; dedupe_key: string | null }[]>(
        columns?: string,
    ) => QueryBuilder<T>;
    insert: <T = unknown[]>(values: unknown) => QueryBuilder<T>;
};

function deliveryTable(supabase: SupabaseLike) {
    return supabase.from(
        "agent_notification_deliveries",
    ) as AgentNotificationDeliveryTable;
}

function cutoffIso(cooldownHours: number, now = new Date()) {
    return new Date(now.getTime() - cooldownHours * 60 * 60 * 1000).toISOString();
}

function throwQueryError(error: QueryError | null) {
    if (error) throw new Error(error.message);
}

export async function listRecentlyDeliveredDedupeKeys(
    supabase: SupabaseLike,
    params: {
        teamId: string;
        cooldownHours?: number;
        now?: Date;
    },
): Promise<Set<string>> {
    const { data, error } = await deliveryTable(supabase)
        .select("dedupe_key")
        .eq("team_id", params.teamId)
        .gte(
            "sent_at",
            cutoffIso(
                params.cooldownHours ?? DEFAULT_NOTIFICATION_COOLDOWN_HOURS,
                params.now,
            ),
        );

    throwQueryError(error);
    return new Set(
        (data ?? [])
            .map((row) => row.dedupe_key)
            .filter((key): key is string => typeof key === "string" && key.length > 0),
    );
}

export async function hasRecentNotificationDelivery(
    supabase: SupabaseLike,
    params: {
        teamId: string;
        dedupeKey: string;
        cooldownHours?: number;
        now?: Date;
    },
): Promise<boolean> {
    const { data, error } = await deliveryTable(supabase)
        .select("id")
        .eq("team_id", params.teamId)
        .eq("dedupe_key", params.dedupeKey)
        .gte(
            "sent_at",
            cutoffIso(
                params.cooldownHours ?? DEFAULT_NOTIFICATION_COOLDOWN_HOURS,
                params.now,
            ),
        )
        .limit(1);

    throwQueryError(error);
    return (data ?? []).length > 0;
}

export async function recordNotificationDelivery(
    supabase: SupabaseLike,
    params: {
        suggestion: AgentSuggestion;
        payload: NotificationSuggestionPayload;
        sentBy: string;
    },
) {
    const { suggestion, payload, sentBy } = params;
    const { error } = await deliveryTable(supabase).insert({
        team_id: suggestion.team_id,
        suggestion_id: suggestion.id,
        agent_type: suggestion.agent_type,
        target_table: suggestion.target_table,
        target_id: suggestion.target_id,
        dedupe_key: suggestion.dedupe_key,
        channel: payload.channel,
        recipient_member: payload.recipientMember ?? null,
        payload: suggestion.payload,
        sent_by: sentBy,
    });

    throwQueryError(error);
}
