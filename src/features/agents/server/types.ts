export type AgentType =
    | "task_quality"
    | "accessibility_reminder"
    | "workload_balance"
    | "notification";

export type AgentSeverity = "info" | "low" | "medium" | "high" | "critical";

export type AgentSuggestionStatus =
    | "pending"
    | "approved"
    | "dismissed"
    | "applied";

export type AgentSuggestion = {
    id: number;
    team_id: string;
    agent_type: AgentType;
    title: string;
    summary: string;
    severity: AgentSeverity;
    status: AgentSuggestionStatus;
    dedupe_key: string | null;
    target_table: string | null;
    target_id: number | null;
    payload: Record<string, unknown>;
    evidence: Record<string, unknown>;
    created_by: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
};

export type NewAgentSuggestion = Omit<
    AgentSuggestion,
    "id" | "status" | "reviewed_by" | "reviewed_at" | "created_at"
> & {
    status?: AgentSuggestionStatus;
};

export type NotificationChannel = "personal_dm" | "team_room";

export type NotificationSuggestionPayload = {
    channel: NotificationChannel;
    recipientMember?: string;
    text: string;
    card?: GoogleChatCardPayload;
    reason: string;
    recommendedSendAt?: string;
};

export type GoogleChatCardPayload = {
    title: string;
    subtitle?: string;
    sections: Array<{
        header?: string;
        widgets: Array<{
            textParagraph: {
                text: string;
            };
        }>;
    }>;
};
