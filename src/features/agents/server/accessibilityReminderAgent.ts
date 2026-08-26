import type { Accessibility } from "@/shared/types";
import { getDiff } from "@/shared/utils/utils";
import type { NewAgentSuggestion, NotificationSuggestionPayload } from "./types";

const REQUEST_NEEDED_STATUSES = new Set([
    "신청필요",
]);

function isRequestNeeded(status: string | null | undefined) {
    return status ? REQUEST_NEEDED_STATUSES.has(status) : false;
}

function notificationPayload(
    payload: NotificationSuggestionPayload,
): Record<string, unknown> {
    return payload as Record<string, unknown>;
}

export function buildAccessibilityReminderSuggestions(input: {
    teamId: string;
    accessibility: Accessibility[];
    createdBy: string | null;
    now?: Date;
}): NewAgentSuggestion[] {
    const suggestions: NewAgentSuggestion[] = [];

    for (const row of input.accessibility) {
        if (!isRequestNeeded(row.inspection_status)) continue;

        const diff = getDiff(row.end_date);
        if (diff === null || diff > 45) continue;

        const overdue = diff < 0;
        const severity = overdue || diff <= 14 ? "high" : "medium";
        suggestions.push({
            team_id: input.teamId,
            agent_type: "accessibility_reminder",
            dedupe_key: `accessibility-reminder:${row.id}:${overdue ? "overdue" : "due-soon"}`,
            title: `접근성 인증 알림: ${row.proj}`,
            summary: overdue
                ? `${row.proj} 접근성 인증 기한이 ${Math.abs(diff)}일 지났습니다.`
                : `${row.proj} 접근성 인증 기한이 D-${diff}입니다.`,
            severity,
            target_table: "accessibility",
            target_id: row.id,
            created_by: input.createdBy,
            payload: notificationPayload({
                channel: "personal_dm",
                recipientMember: row.member,
                reason: overdue
                    ? "overdue_accessibility"
                    : "accessibility_due_soon",
                text: overdue
                    ? `[접근성 알림] ${row.proj} 인증 기한이 D+${Math.abs(diff)}입니다. 신청/갱신 상태를 확인해주세요.`
                    : `[접근성 알림] ${row.proj} 인증 기한이 D-${diff}입니다. 신청 필요 상태를 확인해주세요.`,
            }),
            evidence: {
                accessibilityId: row.id,
                project: row.proj,
                member: row.member,
                inspectionStatus: row.inspection_status,
                endDate: row.end_date,
                daysFromDue: diff,
            },
        });
    }

    return suggestions;
}
