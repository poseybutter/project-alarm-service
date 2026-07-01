import { TEAM_ID } from "@/lib/constants";
import type { Accessibility, Task } from "@/lib/types";
import { getDiff } from "@/lib/utils";
import type {
    GoogleChatCardPayload,
    NewAgentSuggestion,
    NotificationSuggestionPayload,
} from "./types";

const DONE_STATUSES = new Set(["완료", "끝남"]);
const URGENT_PRIORITIES = new Set(["긴급", "매우 긴급"]);

export type CalendarEventInput = {
    id: number | string;
    member: string;
    email: string;
    title: string;
    starts_at: string | null;
    ends_at: string | null;
    all_day: boolean;
    location: string | null;
    html_link: string | null;
};

export type PersonalReminderInput = {
    id: number;
    member: string;
    email: string;
    title: string;
    note: string | null;
    remind_at: string | null;
    due_date: string | null;
};

export type QuestBriefingInput = {
    id: number;
    member: string;
    content: string;
    proj: string | null;
    end_date: string | null;
    task_id?: number | null;
    status?: string | null;
};

type AlertTask = {
    task: Task;
    diff: number;
};

type AccessibilityAlert = {
    row: Accessibility;
    diff: number | null;
    reason: "due" | "missing_schedule";
};

type MemberDigest = {
    tasks: AlertTask[];
    events: CalendarEventInput[];
    accessibility: AccessibilityAlert[];
    reminders: PersonalReminderInput[];
};

function isDone(status: string | null | undefined) {
    return status ? DONE_STATUSES.has(status) : false;
}

function notificationPayload(
    payload: NotificationSuggestionPayload,
): Record<string, unknown> {
    return payload as Record<string, unknown>;
}

function todayKstYmd(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}

function isTodayKst(value: string | null, today: string) {
    if (!value) return false;
    return (
        new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date(value)) === today
    );
}

function formatDue(diff: number) {
    if (diff < 0) return `기한 초과 ${Math.abs(diff)}일`;
    if (diff === 0) return "D-day";
    return `D-${diff}`;
}

function formatDueCard(diff: number) {
    const color = diff <= 0 ? "#c5221f" : "#1a73e8";
    return `<font color="${color}"><b>${formatDue(diff)}</b></font>`;
}

function formatEventTime(event: CalendarEventInput) {
    if (event.all_day) return "종일";
    if (!event.starts_at) return "시간 미정";

    const start = new Date(event.starts_at).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Seoul",
    });

    if (!event.ends_at) return start;

    const end = new Date(event.ends_at).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Seoul",
    });
    return `${start} ~ ${end}`;
}

function taskLine(item: AlertTask, index: number) {
    const { task, diff } = item;
    const content = task.content?.split("\n")[0]?.trim();
    const contentText = content ? ` — ${content}` : "";
    const status = task.status ? ` (${task.status})` : "";
    return `${index}. ${task.proj}${contentText}${status} (${formatDue(diff)})`;
}

function eventLine(event: CalendarEventInput, index: number) {
    const location = event.location ? ` · ${event.location}` : "";
    return `${index}. ${event.title} (${formatEventTime(event)})${location}`;
}

function reminderLine(reminder: PersonalReminderInput, index: number) {
    const note = reminder.note ? ` — ${reminder.note}` : "";
    return `${index}. ${reminder.title}${note}`;
}

function accessibilityLine(item: AccessibilityAlert, index: number) {
    const status = item.row.inspection_status
        ? ` (${item.row.inspection_status})`
        : "";
    if (item.reason === "missing_schedule") {
        return `${index}. ${item.row.proj}${status} (인증 일정 확인 필요)`;
    }
    return `${index}. ${item.row.proj}${status} (${formatDue(item.diff ?? 0)})`;
}

function htmlToPlainText(value: string | null | undefined) {
    if (!value) return "";
    return value
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
}

function escapeGChatText(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function taskCardText(item: AlertTask, index: number) {
    const { task, diff } = item;
    const content = task.content?.split("\n")[0]?.trim();
    const status = task.status ? escapeGChatText(task.status) : "상태 없음";
    const project = escapeGChatText(task.proj || "프로젝트 없음");
    const body = content ? `<br>${escapeGChatText(content)}` : "";
    return `<b>${index}. ${project}</b>${body}<br><font color="#777777">${status}</font> · ${formatDueCard(diff)}`;
}

function eventCardText(event: CalendarEventInput, index: number) {
    const title = escapeGChatText(event.title || "제목 없음");
    const location = event.location
        ? `<br><font color="#777777">${escapeGChatText(event.location)}</font>`
        : "";
    return `<b>${index}. ${title}</b><br><font color="#777777">${formatEventTime(event)}</font>${location}`;
}

function reminderCardText(reminder: PersonalReminderInput, index: number) {
    const title = escapeGChatText(reminder.title || "개인 메모");
    const note = reminder.note
        ? `<br><font color="#777777">${escapeGChatText(reminder.note)}</font>`
        : "";
    return `<b>${index}. ${title}</b>${note}`;
}

function accessibilityCardText(item: AccessibilityAlert, index: number) {
    const project = escapeGChatText(item.row.proj || "프로젝트 없음");
    const status = item.row.inspection_status
        ? escapeGChatText(item.row.inspection_status)
        : "상태 없음";
    const due =
        item.reason === "missing_schedule"
            ? '<font color="#c5221f"><b>인증 일정 확인 필요</b></font>'
            : formatDueCard(item.diff ?? 0);
    return `<b>${index}. ${project}</b><br><font color="#777777">${status}</font> · ${due}`;
}

function buildMemberMessage(member: string, digest: MemberDigest) {
    const todoCount = digest.tasks.length + digest.reminders.length;
    const lines = [
        `☀️ ${member}님, 좋은 아침이에요!`,
        "모닝 기상나팔 📯",
    ];

    if (digest.events.length > 0) {
        lines.push(
            "",
            `오늘 일정 (${digest.events.length}건)`,
            ...digest.events.map((event, index) => eventLine(event, index + 1)),
        );
    }

    if (digest.accessibility.length > 0) {
        lines.push(
            "",
            `접근성 인증 (${digest.accessibility.length}건)`,
            ...digest.accessibility.map((item, index) =>
                accessibilityLine(item, index + 1),
            ),
        );
    }

    if (todoCount > 0) {
        lines.push(
            "",
            `오늘의 퀘스트 (${todoCount}건)`,
            ...digest.tasks.map((item, index) => taskLine(item, index + 1)),
            ...digest.reminders.map((reminder, index) =>
                reminderLine(reminder, digest.tasks.length + index + 1),
            ),
        );
    }

    return lines.join("\n");
}

function buildMemberCard(
    member: string,
    digest: MemberDigest,
): GoogleChatCardPayload {
    const sections: GoogleChatCardPayload["sections"] = [];
    const todoCount = digest.tasks.length + digest.reminders.length;

    if (digest.events.length > 0) {
        sections.push({
            header: `오늘 일정 (${digest.events.length}건)`,
            widgets: digest.events.map((event, index) => ({
                textParagraph: {
                    text: eventCardText(event, index + 1),
                },
            })),
        });
    }

    if (digest.accessibility.length > 0) {
        sections.push({
            header: `접근성 인증 (${digest.accessibility.length}건)`,
            widgets: digest.accessibility.map((item, index) => ({
                textParagraph: {
                    text: accessibilityCardText(item, index + 1),
                },
            })),
        });
    }

    if (todoCount > 0) {
        sections.push({
            header: `오늘의 퀘스트 (${todoCount}건)`,
            widgets: [
                ...digest.tasks.map((item, index) => ({
                    textParagraph: {
                        text: taskCardText(item, index + 1),
                    },
                })),
                ...digest.reminders.map((reminder, index) => ({
                    textParagraph: {
                        text: reminderCardText(
                            reminder,
                            digest.tasks.length + index + 1,
                        ),
                    },
                })),
            ],
        });
    }

    return {
        title: `☀️ ${member}님, 좋은 아침이에요!`,
        subtitle: "모닝 기상나팔 📯",
        sections,
    };
}

function memberSeverity(digest: MemberDigest) {
    if (digest.tasks.some((item) => item.diff <= -7)) return "critical";
    if (
        digest.accessibility.some(
            (item) =>
                item.reason === "missing_schedule" ||
                (item.diff !== null && item.diff <= 0),
        )
    ) {
        return "high";
    }
    if (
        digest.tasks.some(
            (item) =>
                item.diff <= 0 ||
                (item.task.priority && URGENT_PRIORITIES.has(item.task.priority)),
        )
    ) {
        return "high";
    }
    if (
        digest.accessibility.some(
            (item) => item.diff !== null && item.diff <= 14,
        )
    ) {
        return "medium";
    }
    if (digest.tasks.length > 0) return "medium";
    if (digest.accessibility.length > 0) return "medium";
    return "info";
}

function digestSignature(digest: MemberDigest) {
    const taskPart = digest.tasks
        .map((item) => `${item.task.id}:${item.diff}`)
        .sort()
        .join(",");
    const eventPart = digest.events
        .map((event) => `${event.id}:${event.starts_at ?? ""}`)
        .sort()
        .join(",");
    const accessibilityPart = digest.accessibility
        .map(
            (item) =>
                `${item.row.id}:${item.reason}:${item.row.end_date ?? ""}:${
                    item.diff ?? "none"
                }`,
        )
        .sort()
        .join(",");
    const reminderPart = digest.reminders
        .map((reminder) => `${reminder.id}:${reminder.title}`)
        .sort()
        .join(",");
    return `tasks=${taskPart || "none"};events=${eventPart || "none"};accessibility=${accessibilityPart || "none"};reminders=${reminderPart || "none"}`;
}

export function buildNotificationSuggestions(input: {
    tasks: Task[];
    accessibility?: Accessibility[];
    calendarEvents?: CalendarEventInput[];
    personalReminders?: PersonalReminderInput[];
    quests?: QuestBriefingInput[];
    createdBy: string | null;
    now?: Date;
}): NewAgentSuggestion[] {
    const grouped = new Map<string, MemberDigest>();
    const today = todayKstYmd(input.now);

    function ensureDigest(member: string) {
        const existing = grouped.get(member);
        if (existing) return existing;
        const next = { tasks: [], events: [], accessibility: [], reminders: [] };
        grouped.set(member, next);
        return next;
    }

    for (const task of input.tasks) {
        if (isDone(task.status)) continue;

        const diff = getDiff(task.end_date);
        if (diff === null) continue;
        if (diff > 3) continue;

        ensureDigest(task.member).tasks.push({ task, diff });
    }

    for (const event of input.calendarEvents ?? []) {
        if (!event.member) continue;
        if (!isTodayKst(event.starts_at, today)) continue;
        ensureDigest(event.member).events.push(event);
    }

    for (const row of input.accessibility ?? []) {
        if (!row.member) continue;

        const diff = getDiff(row.end_date);
        if (diff !== null) {
            if (diff > 45) continue;
            ensureDigest(row.member).accessibility.push({
                row,
                diff,
                reason: "due",
            });
            continue;
        }

        if (row.is_new) {
            ensureDigest(row.member).accessibility.push({
                row,
                diff: null,
                reason: "missing_schedule",
            });
        }
    }

    for (const reminder of input.personalReminders ?? []) {
        if (!reminder.member) continue;
        ensureDigest(reminder.member).reminders.push(reminder);
    }

    for (const quest of input.quests ?? []) {
        if (!quest.member) continue;
        if (quest.task_id != null) continue;
        if (quest.status && ["완료", "끝남", "done", "completed"].includes(quest.status)) {
            continue;
        }
        const content = htmlToPlainText(quest.content);
        if (!content) continue;
        ensureDigest(quest.member).reminders.push({
            id: quest.id,
            member: quest.member,
            email: "",
            title: content,
            note: quest.proj,
            remind_at: null,
            due_date: quest.end_date,
        });
    }

    return [...grouped.entries()].map(([member, digest]) => {
        const sortedTasks = [...digest.tasks].sort(
            (a, b) =>
                a.diff - b.diff ||
                Number(Boolean(b.task.priority && URGENT_PRIORITIES.has(b.task.priority))) -
                    Number(Boolean(a.task.priority && URGENT_PRIORITIES.has(a.task.priority))) ||
                a.task.id - b.task.id,
        );
        const sortedEvents = [...digest.events].sort((a, b) =>
            (a.starts_at ?? "").localeCompare(b.starts_at ?? ""),
        );
        const sortedAccessibility = [...digest.accessibility].sort(
            (a, b) =>
                (a.diff ?? -9999) - (b.diff ?? -9999) ||
                a.row.proj.localeCompare(b.row.proj),
        );
        const sortedReminders = [...digest.reminders].sort((a, b) =>
            (a.remind_at ?? a.due_date ?? "").localeCompare(
                b.remind_at ?? b.due_date ?? "",
            ),
        );
        const sortedDigest = {
            tasks: sortedTasks,
            events: sortedEvents,
            accessibility: sortedAccessibility,
            reminders: sortedReminders,
        };
        const signature = digestSignature(sortedDigest);
        const todoCount = sortedTasks.length + sortedReminders.length;
        const summaryParts = [
            `오늘 일정 ${sortedEvents.length}건`,
            sortedAccessibility.length > 0
                ? `접근성 인증 ${sortedAccessibility.length}건`
                : null,
            `오늘의 퀘스트 ${todoCount}건`,
        ].filter(Boolean);

        return {
            team_id: TEAM_ID,
            agent_type: "notification",
            dedupe_key: `notification:member:${member}:${today}:${signature}`,
            title: `${member} 모닝 기상나팔`,
            summary: summaryParts.join(" · "),
            severity: memberSeverity(sortedDigest),
            target_table: "member_daily_digest",
            target_id: null,
            created_by: input.createdBy,
            payload: notificationPayload({
                channel: "personal_dm",
                recipientMember: member,
                reason: "member_daily_digest",
                text: buildMemberMessage(member, sortedDigest),
                card: buildMemberCard(member, sortedDigest),
            }),
            evidence: {
                member,
                taskIds: sortedTasks.map((item) => item.task.id),
                accessibilityIds: sortedAccessibility.map((item) => item.row.id),
                calendarEventIds: sortedEvents.map((event) => event.id),
                tasks: sortedTasks.map((item) => ({
                    id: item.task.id,
                    project: item.task.proj,
                    content: item.task.content,
                    status: item.task.status,
                    priority: item.task.priority,
                    endDate: item.task.end_date,
                    daysFromDue: item.diff,
                })),
                accessibility: sortedAccessibility.map((item) => ({
                    id: item.row.id,
                    project: item.row.proj,
                    status: item.row.inspection_status,
                    startDate: item.row.start_date,
                    endDate: item.row.end_date,
                    daysFromDue: item.diff,
                    reason: item.reason,
                })),
                calendarEvents: sortedEvents.map((event) => ({
                    id: event.id,
                    title: event.title,
                    startsAt: event.starts_at,
                    endsAt: event.ends_at,
                    allDay: event.all_day,
                    location: event.location,
                    htmlLink: event.html_link,
                })),
                personalReminders: sortedReminders.map((reminder) => ({
                    id: reminder.id,
                    title: reminder.title,
                    note: reminder.note,
                    remindAt: reminder.remind_at,
                    dueDate: reminder.due_date,
                })),
            },
        };
    });
}
