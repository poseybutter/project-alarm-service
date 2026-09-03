import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    decryptIntegrationToken,
    encryptIntegrationToken,
} from "@/infrastructure/security/tokenEncryption";
import { listActiveTeamMembers } from "@/features/identity/server/identityRepository";
import type { ContentItem } from "@/shared/types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3";

const FETCH_TIMEOUT_MS = 15_000;

/** 요청률 초과(429)와 일시적 서버 오류에 재시도할 횟수. */
const RATE_LIMIT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Retry-After(초 또는 HTTP-date)를 밀리초로. 없으면 지수 백오프. */
function retryDelayMs(res: Response, attempt: number) {
    const header = res.headers.get("retry-after");
    if (header) {
        const seconds = Number(header);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
        }
        const at = Date.parse(header);
        if (!Number.isNaN(at)) {
            return Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_DELAY_MS);
        }
    }
    return Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

/**
 * 외부 Google API 호출에 로컬 취소 타임아웃을 적용합니다.
 * 429(요청률 초과)와 5xx 는 Retry-After 를 존중해 백오프 후 재시도합니다.
 */
async function fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
    let lastRes: Response | null = null;
    for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            lastRes = await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
        const retryable = lastRes.status === 429 || lastRes.status >= 500;
        if (!retryable || attempt === RATE_LIMIT_RETRIES) return lastRes;
        await sleep(retryDelayMs(lastRes, attempt));
    }
    return lastRes as Response;
}

export type GoogleTokenResponse = {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
};

export type GoogleCalendarEvent = {
    id: string;
    summary?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
    location?: string;
    htmlLink?: string;
    attendees?: Array<{ email?: string; displayName?: string }>;
    extendedProperties?: {
        private?: Record<string, string | undefined>;
        shared?: Record<string, string | undefined>;
    };
};

export type GoogleCalendarConnection = {
    member: string;
    email: string;
    access_token: string | null;
    refresh_token: string | null;
    expires_at: string | null;
};

export type SyncedGoogleCalendarEvent = {
    id?: number;
    member: string;
    email: string;
    title: string;
    starts_at: string | null;
    ends_at: string | null;
    all_day: boolean;
    location: string | null;
    html_link: string | null;
};

type TeamCalendarPlayer = {
    name: string;
    email: string | null;
};

export type TeamCalendarEventInput = {
    eventType: "meeting" | "leave" | "annual_leave" | "offset" | "other";
    title: string;
    date: string;
    endDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    meetingRoom?: string | null;
    targetMember?: string | null;
    attendeeMembers?: string[];
};

export type TeamCalendarTaskInput = {
    id: number;
    member: string;
    proj: string;
    content: string;
    content_items?: ContentItem[] | null;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    show_on_team_calendar?: boolean | null;
    team_calendar_event_id?: string | null;
    team_calendar_item_event_ids?: string[] | null;
    team_calendar_id?: string | null;
};

type MemberCalendarSetting = {
    member: string;
    calendar_id: string;
};

const MEMBER_EVENT_COLOR_IDS = ["2", "5", "6", "9", "10", "11"] as const;

function memberEventColorId(member: string) {
    let hash = 0;
    for (const char of member.normalize("NFKC")) {
        hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
    }
    return MEMBER_EVENT_COLOR_IDS[hash % MEMBER_EVENT_COLOR_IDS.length];
}

export function getGoogleCalendarConfig() {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectUri =
        process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
        `${siteUrl}/api/agents/calendar/callback`;

    if (!clientId || !clientSecret) {
        throw new Error("Google Calendar OAuth env is not configured");
    }

    return { clientId, clientSecret, redirectUri };
}

export function buildGoogleCalendarAuthUrl(state: string) {
    const { clientId, redirectUri } = getGoogleCalendarConfig();
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: [
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/calendar.events.owned",
        ].join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function getValidCalendarAccessToken(
    supabase: {
        from: (table: string) => {
            update: (values: Record<string, unknown>) => {
                eq: (
                    column: string,
                    value: unknown,
                ) => {
                    eq: (
                        column: string,
                        value: unknown,
                    ) => PromiseLike<{ error: { message: string } | null }>;
                };
            };
        };
    },
    teamId: string,
    connection: GoogleCalendarConnection,
) {
    let accessToken = decryptIntegrationToken(connection.access_token);
    const refreshToken = decryptIntegrationToken(connection.refresh_token);
    // 암호화 접두사로 마이그레이션 필요 여부 판정 (매 호출마다 새 IV로 인한 무한 재암호화 방지)
    const needsMigration =
        (connection.access_token &&
            !connection.access_token.startsWith("enc:v1:")) ||
        (connection.refresh_token &&
            !connection.refresh_token.startsWith("enc:v1:"));
    if (needsMigration) {
        const { error } = await supabase
            .from("agent_calendar_connections")
            .update({
                access_token: encryptIntegrationToken(accessToken),
                refresh_token: encryptIntegrationToken(refreshToken),
                updated_at: new Date().toISOString(),
            })
            .eq("team_id", teamId)
            .eq("email", connection.email);
        if (error) throw new Error(error.message);
    }
    const expiresAt = connection.expires_at
        ? new Date(connection.expires_at).getTime()
        : 0;

    if (accessToken && expiresAt >= Date.now() + 60_000) {
        return accessToken;
    }

    if (!refreshToken) {
        throw new TeamCalendarSyncError(
            "팀 캘린더 연결이 만료되었습니다. 관리 > 연동에서 캘린더를 다시 연결해 주세요.",
        );
    }

    const refreshed = await refreshGoogleCalendarToken(refreshToken);
    accessToken = refreshed.access_token;
    const { error } = await supabase
        .from("agent_calendar_connections")
        .update({
            access_token: encryptIntegrationToken(refreshed.access_token),
            expires_at: new Date(
                Date.now() + refreshed.expires_in * 1000,
            ).toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("team_id", teamId)
        .eq("email", connection.email);
    if (error) throw new Error(error.message);

    return accessToken;
}

export async function exchangeGoogleCalendarCode(code: string) {
    const { clientId, clientSecret, redirectUri } = getGoogleCalendarConfig();
    const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    });

    const json = await res.json();
    if (!res.ok) {
        throw new Error(
            json.error_description || json.error || "Token exchange failed",
        );
    }
    return json as GoogleTokenResponse;
}

export async function refreshGoogleCalendarToken(refreshToken: string) {
    const { clientId, clientSecret } = getGoogleCalendarConfig();
    const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });

    const json = await res.json();
    if (!res.ok) {
        throw new Error(
            json.error_description || json.error || "Token refresh failed",
        );
    }
    return json as GoogleTokenResponse;
}

export function todayKstWindow(now = new Date()) {
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const y = kstNow.getUTCFullYear();
    const m = kstNow.getUTCMonth();
    const d = kstNow.getUTCDate();
    const startUtc = new Date(Date.UTC(y, m, d, -9, 0, 0, 0));
    const endUtc = new Date(Date.UTC(y, m, d + 1, -9, 0, 0, 0));
    return {
        timeMin: startUtc.toISOString(),
        timeMax: endUtc.toISOString(),
    };
}

export async function fetchTodayGoogleCalendarEvents(accessToken: string) {
    const { timeMin, timeMax } = todayKstWindow();
    const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        timeMin,
        timeMax,
    });

    const res = await fetchWithTimeout(
        `${GOOGLE_EVENTS_URL}?${params.toString()}`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    const json = await res.json();
    if (!res.ok) {
        throw new Error(
            json.error?.message || "Failed to fetch calendar events",
        );
    }
    return (json.items ?? []) as GoogleCalendarEvent[];
}

export async function fetchTodayGoogleCalendarEventsByCalendarId(
    accessToken: string,
    calendarId: string,
) {
    const { timeMin, timeMax } = todayKstWindow();
    const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        timeMin,
        timeMax,
    });

    const res = await fetchWithTimeout(
        `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    const json = await res.json();
    if (!res.ok) {
        throw new Error(
            json.error?.message || "Failed to fetch calendar events",
        );
    }
    return (json.items ?? []) as GoogleCalendarEvent[];
}

function eventDateTime(
    value: { date?: string; dateTime?: string } | undefined,
) {
    if (!value) return { at: null, allDay: false };
    if (value.dateTime) return { at: value.dateTime, allDay: false };
    if (value.date) return { at: `${value.date}T00:00:00+09:00`, allDay: true };
    return { at: null, allDay: false };
}

export async function syncTodayGoogleCalendarEvents(
    supabase: {
        from: (table: string) => {
            update: (values: Record<string, unknown>) => {
                eq: (
                    column: string,
                    value: unknown,
                ) => {
                    eq: (
                        column: string,
                        value: unknown,
                    ) => PromiseLike<{ error: { message: string } | null }>;
                };
            };
            delete: () => {
                eq: (
                    column: string,
                    value: unknown,
                ) => {
                    eq: (
                        column: string,
                        value: unknown,
                    ) => {
                        eq: (
                            column: string,
                            value: unknown,
                        ) => {
                            gte: (
                                column: string,
                                value: unknown,
                            ) => {
                                lt: (
                                    column: string,
                                    value: unknown,
                                ) => PromiseLike<{
                                    error: { message: string } | null;
                                }>;
                            };
                        };
                    };
                };
            };
            upsert: (
                values: Record<string, unknown>[],
                options: { onConflict: string },
            ) => {
                select: (columns: string) => PromiseLike<{
                    data: SyncedGoogleCalendarEvent[] | null;
                    error: { message: string } | null;
                }>;
            };
        };
    },
    params: {
        teamId: string;
        connection: GoogleCalendarConnection;
    },
) {
    const { teamId, connection } = params;
    const accessToken = await getValidCalendarAccessToken(
        supabase,
        teamId,
        connection,
    );

    const events = await fetchTodayGoogleCalendarEvents(accessToken);
    const rows = events.map((event) => {
        const start = eventDateTime(event.start);
        const end = eventDateTime(event.end);
        return {
            team_id: teamId,
            member: connection.member,
            email: connection.email,
            google_event_id: event.id,
            calendar_id: "primary",
            title: event.summary || "(제목 없음)",
            starts_at: start.at,
            ends_at: end.at,
            all_day: start.allDay,
            location: event.location ?? null,
            html_link: event.htmlLink ?? null,
            synced_at: new Date().toISOString(),
        };
    });

    const { timeMin, timeMax } = todayKstWindow();
    const { error: deleteError } = await supabase
        .from("agent_calendar_events")
        .delete()
        .eq("team_id", teamId)
        .eq("email", connection.email)
        .eq("calendar_id", "primary")
        .gte("starts_at", timeMin)
        .lt("starts_at", timeMax);
    if (deleteError) throw new Error(deleteError.message);

    if (rows.length === 0) return [];

    const { data, error } = await supabase
        .from("agent_calendar_events")
        .upsert(rows, {
            onConflict: "team_id,email,calendar_id,google_event_id",
        })
        .select(
            "id, member, email, title, starts_at, ends_at, all_day, location, html_link",
        );
    if (error) throw new Error(error.message);

    return data ?? [];
}

function teamCalendarEventType(event: GoogleCalendarEvent) {
    const explicit =
        event.extendedProperties?.private?.eventType ||
        event.extendedProperties?.shared?.eventType;
    if (explicit) return explicit;

    const title = event.summary ?? "";
    if (/\[(휴가|연차|시차)\]|휴가|연차|시차/.test(title)) return "leave";
    if (/\[(회의|미팅)\]|회의|미팅|meeting/i.test(title)) return "meeting";
    return "other";
}

function extractMemberFromTeamEventTitle(
    title: string,
    players: TeamCalendarPlayer[],
) {
    const bracket = title.match(/\[(?:휴가|연차|시차)\]\s*([^\s-]+)/);
    const bracketName = bracket?.[1]?.trim();
    if (bracketName && players.some((player) => player.name === bracketName)) {
        return bracketName;
    }
    return players.find((player) => title.includes(player.name))?.name ?? null;
}

function targetPlayersForTeamEvent(
    event: GoogleCalendarEvent,
    players: TeamCalendarPlayer[],
) {
    const type = teamCalendarEventType(event);
    if (["leave", "annual_leave", "offset"].includes(type)) {
        return players;
    }

    const attendeeMembers = (
        event.extendedProperties?.private?.attendeeMembers ||
        event.extendedProperties?.shared?.attendeeMembers ||
        ""
    )
        .split(",")
        .map((member) => member.trim())
        .filter(Boolean);
    if (attendeeMembers.length > 0) {
        const memberSet = new Set(attendeeMembers);
        const taggedPlayers = players.filter((player) =>
            memberSet.has(player.name),
        );
        if (taggedPlayers.length > 0) return taggedPlayers;
    }

    const attendeeEmails = new Set(
        (event.attendees ?? [])
            .map((attendee) => attendee.email?.toLowerCase())
            .filter(Boolean),
    );
    const attendeePlayers = players.filter((player) =>
        player.email ? attendeeEmails.has(player.email.toLowerCase()) : false,
    );

    if (attendeePlayers.length > 0) return attendeePlayers;
    if (type === "meeting") return players;
    return [];
}

function displayTitleForTeamEvent(
    event: GoogleCalendarEvent,
    players: TeamCalendarPlayer[],
) {
    const title = event.summary || "(제목 없음)";
    const type = teamCalendarEventType(event);
    if (type === "leave" || type === "annual_leave" || type === "offset") {
        const member =
            event.extendedProperties?.private?.member ||
            event.extendedProperties?.shared?.member ||
            extractMemberFromTeamEventTitle(title, players);
        return member && !title.includes(member)
            ? `${title} - ${member}`
            : title;
    }
    return title;
}

function isAppTaskCalendarEvent(event: GoogleCalendarEvent) {
    return Boolean(
        event.extendedProperties?.private?.taskId ||
        event.extendedProperties?.shared?.taskId,
    );
}

export async function syncTodayTeamCalendarEvents(
    supabase: SupabaseClient,
    params: {
        teamId: string;
    },
) {
    const { teamId } = params;
    const { data: setting, error: settingError } = await supabase
        .from("agent_team_calendar_settings")
        .select("calendar_id, connection_email")
        .eq("team_id", teamId)
        .maybeSingle();
    if (settingError) throw new Error(settingError.message);
    if (!setting?.calendar_id || !setting.connection_email) return [];

    const { data: memberCalendarSettings, error: memberCalendarError } =
        await supabase
            .from("agent_member_calendar_settings")
            .select("member, calendar_id")
            .eq("team_id", teamId);
    if (memberCalendarError) throw new Error(memberCalendarError.message);

    const { data: connection, error: connectionError } = await supabase
        .from("agent_calendar_connections")
        .select("member, email, access_token, refresh_token, expires_at")
        .eq("team_id", teamId)
        .eq("email", setting.connection_email)
        .maybeSingle();
    if (connectionError) throw new Error(connectionError.message);
    if (!connection) return [];

    const activeMembers = await listActiveTeamMembers(supabase, teamId);
    const teamPlayers: TeamCalendarPlayer[] = activeMembers
        .filter((m) => m.name && m.email)
        .map((m) => ({ name: m.name, email: m.email }));
    if (teamPlayers.length === 0) return [];

    const accessToken = await getValidCalendarAccessToken(
        supabase,
        teamId,
        connection as GoogleCalendarConnection,
    );
    const sharedEvents = await fetchTodayGoogleCalendarEventsByCalendarId(
        accessToken,
        setting.calendar_id,
    );
    const sharedRows = sharedEvents.flatMap((event) => {
        const targets = targetPlayersForTeamEvent(event, teamPlayers);
        const start = eventDateTime(event.start);
        const end = eventDateTime(event.end);
        const title = displayTitleForTeamEvent(event, teamPlayers);
        return targets.map((player) => ({
            team_id: teamId,
            member: player.name,
            email: player.email,
            google_event_id: event.id,
            calendar_id: setting.calendar_id,
            title,
            starts_at: start.at,
            ends_at: end.at,
            all_day: start.allDay,
            location: event.location ?? null,
            html_link: event.htmlLink ?? null,
            synced_at: new Date().toISOString(),
        }));
    });

    const memberCalendarRows = (
        (memberCalendarSettings ?? []) as MemberCalendarSetting[]
    ).filter((row) => row.member && row.calendar_id);
    const memberRowsNested = await Promise.all(
        memberCalendarRows.map(async (calendar) => {
            const player = teamPlayers.find(
                (item) => item.name === calendar.member,
            );
            if (!player) return [];
            const events = await fetchTodayGoogleCalendarEventsByCalendarId(
                accessToken,
                calendar.calendar_id,
            );
            return events
                .filter((event) => !isAppTaskCalendarEvent(event))
                .map((event) => {
                    const start = eventDateTime(event.start);
                    const end = eventDateTime(event.end);
                    return {
                        team_id: teamId,
                        member: player.name,
                        email: player.email,
                        google_event_id: event.id,
                        calendar_id: calendar.calendar_id,
                        title: event.summary || "(제목 없음)",
                        starts_at: start.at,
                        ends_at: end.at,
                        all_day: start.allDay,
                        location: event.location ?? null,
                        html_link: event.htmlLink ?? null,
                        synced_at: new Date().toISOString(),
                    };
                });
        }),
    );
    const rows = [...sharedRows, ...memberRowsNested.flat()];
    const calendarIds = [
        setting.calendar_id,
        ...memberCalendarRows.map((row) => row.calendar_id),
    ];

    const { timeMin, timeMax } = todayKstWindow();
    for (const calendarId of calendarIds) {
        const { error: deleteError } = await supabase
            .from("agent_calendar_events")
            .delete()
            .eq("team_id", teamId)
            .eq("calendar_id", calendarId)
            .gte("starts_at", timeMin)
            .lt("starts_at", timeMax);
        if (deleteError) throw new Error(deleteError.message);
    }

    if (rows.length === 0) return [];

    const { data, error } = await supabase
        .from("agent_calendar_events")
        .upsert(rows, {
            onConflict: "team_id,email,calendar_id,google_event_id",
        })
        .select(
            "id, member, email, title, starts_at, ends_at, all_day, location, html_link",
        );
    if (error) throw new Error(error.message);

    return data ?? [];
}

function toGoogleAllDayEnd(date: string) {
    // UTC 기준으로 날짜 산술 수행 (KST 오프셋으로 인한 날짜 오차 방지)
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
}

/**
 * 사용자가 직접 조치할 수 있는 팀 캘린더 동기화 오류(설정 누락, 필수 값 누락 등).
 * 라우트가 이 오류만 사유 그대로 노출하고, 나머지는 일반 메시지로 감춘다.
 */
export class TeamCalendarSyncError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TeamCalendarSyncError";
    }
}

/** 자체 일정이 있는 항목 / 없는 항목으로 업무 내용을 가른다. */
function splitContentItemsBySchedule(task: TeamCalendarTaskInput) {
    const items = (task.content_items ?? []).filter((ci) => ci.text?.trim());
    const scheduled: { item: ContentItem; start: string; end: string }[] = [];
    const unscheduled: ContentItem[] = [];
    for (const item of items) {
        const start = item.start_date || item.end_date;
        const end = item.end_date || item.start_date;
        if (start && end) scheduled.push({ item, start, end });
        else unscheduled.push(item);
    }
    return { hasItems: items.length > 0, scheduled, unscheduled };
}

function buildTeamCalendarEvent(
    task: TeamCalendarTaskInput,
    override?: { title?: string; startDate?: string; endDate?: string },
) {
    const startDate = override?.startDate || task.start_date || task.end_date;
    const endDate =
        override?.endDate || task.end_date || task.start_date || startDate;
    if (!startDate) {
        throw new TeamCalendarSyncError(
            "팀 캘린더에 표시하려면 업무 기간 또는 마감일이 필요합니다",
        );
    }

    const title = override?.title?.trim() || task.content?.trim() || "업무";
    const project = task.proj?.trim();
    const memberPrefix = `[${task.member}]`;
    return {
        summary: project
            ? `${memberPrefix} ${project} - ${title}`
            : `${memberPrefix} ${title}`,
        description: [
            `담당자: ${task.member}`,
            task.status ? `상태: ${task.status}` : null,
            "project-alarm-service에서 생성한 팀 캘린더 일정입니다.",
        ]
            .filter(Boolean)
            .join("\n"),
        start: { date: startDate },
        end: { date: toGoogleAllDayEnd(endDate || startDate) },
        extendedProperties: {
            private: {
                source: "project-alarm-service",
                taskId: String(task.id),
            },
        },
        colorId: memberEventColorId(task.member),
    };
}

function stableTaskEventId(taskId: number): string {
    // 'v' prefix (valid base32hex char)로 일반 이벤트와 구분합니다.
    return `v${taskId.toString().padStart(6, "0")}`;
}

/**
 * 내용 항목 일정의 기본 ID. 업무 기간 일정(stableTaskEventId)과 겹치면 안 된다.
 * Google 이벤트 ID는 base32hex(a-v, 0-9)만 허용하므로 'i'를 구분자로 쓴다.
 */
function stableTaskItemEventId(taskId: number, index: number): string {
    return `${stableTaskEventId(taskId)}i${index.toString().padStart(2, "0")}`;
}

async function updateTeamCalendarEvent(params: {
    accessToken: string;
    url: string;
    event: ReturnType<typeof buildTeamCalendarEvent>;
}) {
    const res = await fetchWithTimeout(params.url, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${params.accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(params.event),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
}

export async function upsertTeamCalendarTaskEvent(params: {
    accessToken: string;
    calendarId: string;
    task: TeamCalendarTaskInput;
    override?: { title?: string; startDate?: string; endDate?: string };
    /** 저장된 이벤트 ID가 없을 때 쓸 ID. 항목 일정은 업무 일정과 달라야 한다. */
    fallbackEventId?: string;
}) {
    const { accessToken, calendarId, task, override, fallbackEventId } = params;
    const event = buildTeamCalendarEvent(task, override);
    const encodedCalendarId = encodeURIComponent(calendarId);
    const eventId =
        task.team_calendar_event_id ??
        fallbackEventId ??
        stableTaskEventId(task.id);
    const url = `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodedCalendarId}/events/${encodeURIComponent(eventId)}`;

    const { res, json } = await updateTeamCalendarEvent({
        accessToken,
        url,
        event,
    });

    if (res.ok) {
        return json as GoogleCalendarEvent;
    }

    // 이벤트를 캘린더에서 지우면 404(없음) 또는 410(Gone)이 온다.
    // deleteTeamCalendarTaskEvent 와 같은 기준으로 둘 다 "다시 만들기"로 처리한다.
    if (res.status === 404 || res.status === 410) {
        const insertEvent = async (body: Record<string, unknown>) => {
            const insertRes = await fetchWithTimeout(
                `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodedCalendarId}/events`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                },
            );
            return {
                res: insertRes,
                json: await insertRes.json().catch(() => ({})),
            };
        };

        const insert = await insertEvent({ ...event, id: eventId });
        if (insert.res.ok) {
            return insert.json as GoogleCalendarEvent;
        }

        // 409 = 그 ID 가 이미 존재한다(동시 생성 또는 소프트 삭제). 갱신으로 재시도한다.
        if (insert.res.status === 409) {
            const retry = await updateTeamCalendarEvent({
                accessToken,
                url,
                event,
            });
            if (retry.res.ok) {
                return retry.json as GoogleCalendarEvent;
            }

            // 갱신마저 404/410 이면 그 ID 는 재사용할 수 없는 묘비다.
            // 이때만 Google 이 새 ID 를 발급하게 한다. 다른 실패(403 등)에서
            // 새로 만들면 살아 있는 일정과 중복된 사본이 생긴다.
            if (retry.res.status === 404 || retry.res.status === 410) {
                const fresh = await insertEvent(event);
                if (fresh.res.ok) {
                    return fresh.json as GoogleCalendarEvent;
                }
                throw new Error(
                    fresh.json.error?.message ||
                        "Failed to create team calendar event",
                );
            }

            throw new Error(
                retry.json.error?.message ||
                    "Failed to sync team calendar event after conflict",
            );
        }

        throw new Error(
            insert.json.error?.message ||
                "Failed to create team calendar event",
        );
    }

    throw new Error(
        json.error?.message || "Failed to sync team calendar event",
    );
}

/**
 * 업무 하나를 팀 캘린더 일정 집합으로 동기화한다.
 *
 * - 자체 일정이 있는 내용 항목 → 그 기간으로 항목별 일정
 * - 일정이 없는 항목들 → 업무 기간 일정 하나에 모아서
 * - content_items 가 없는 기존 업무 → 예전처럼 업무 기간 일정 하나
 *
 * 항목이 줄거나 일정이 빠지면 남는 일정은 지운다.
 */
export type TeamCalendarSyncProgress = {
    baseEventId: string | null;
    itemEventIds: string[];
};

/**
 * 여러 일정 중 일부만 만들어진 뒤 실패했을 때 던진다.
 * 이미 만들어진 이벤트 ID를 실어 보내, 호출부가 저장하고 다음 시도에서 재사용하게 한다.
 * 저장하지 않으면 그 이벤트는 참조를 잃고 캘린더에 고아로 남는다.
 */
export class TeamCalendarPartialSyncError extends Error {
    constructor(
        readonly reason: unknown,
        readonly progress: TeamCalendarSyncProgress,
    ) {
        super(reason instanceof Error ? reason.message : "팀 캘린더 동기화 실패");
        this.name = "TeamCalendarPartialSyncError";
    }
}

export async function syncTeamCalendarTaskEvents(params: {
    accessToken: string;
    calendarId: string;
    task: TeamCalendarTaskInput;
}) {
    const { accessToken, calendarId, task } = params;
    const { hasItems, scheduled, unscheduled } =
        splitContentItemsBySchedule(task);

    // 원격 쓰기 중간에 실패해도 이미 만든 이벤트 ID는 호출부가 저장할 수 있어야 한다.
    // 저장하지 못하면 그 이벤트는 참조를 잃고 캘린더에 고아로 남는다.
    const progress: TeamCalendarSyncProgress = {
        baseEventId: task.team_calendar_event_id ?? null,
        itemEventIds: [...(task.team_calendar_item_event_ids ?? [])],
    };

    async function syncEvents() {
        // 업무 기간 일정: 항목이 없으면 기존 content 전체, 있으면 일정 없는 항목만 모은다.
        const baseTitle = hasItems
            ? unscheduled.map((ci) => ci.text.trim()).join("\n")
            : task.content?.trim() || "";
        const needsBaseEvent = baseTitle.length > 0;

        let baseEventId = task.team_calendar_event_id ?? null;
        let htmlLink: string | null = null;

        if (needsBaseEvent) {
            const event = await upsertTeamCalendarTaskEvent({
                accessToken,
                calendarId,
                task: { ...task, team_calendar_event_id: baseEventId },
                override: { title: baseTitle },
            });
            baseEventId = event.id;
            progress.baseEventId = event.id;
            htmlLink = event.htmlLink ?? null;
        } else if (baseEventId) {
            // 모든 항목이 자기 일정을 갖게 되면 업무 기간 일정은 비므로 지운다.
            await deleteTeamCalendarTaskEvent({
                accessToken,
                calendarId,
                eventId: baseEventId,
            });
            baseEventId = null;
            progress.baseEventId = null;
        }

        const previousItemEventIds = task.team_calendar_item_event_ids ?? [];
        const itemEventIds: string[] = [];
        for (const [index, entry] of scheduled.entries()) {
            const event = await upsertTeamCalendarTaskEvent({
                accessToken,
                calendarId,
                task: {
                    ...task,
                    team_calendar_event_id: previousItemEventIds[index] ?? null,
                },
                override: {
                    title: entry.item.text,
                    startDate: entry.start,
                    endDate: entry.end,
                },
                fallbackEventId: stableTaskItemEventId(task.id, index),
            });
            itemEventIds.push(event.id);
            // 뒤 항목에서 실패해도 방금 만든 ID 를 잃지 않도록 즉시 반영한다.
            // 아직 정리하지 않은 예전 ID 는 뒤에 남겨 다음 시도에서 지울 수 있게 한다.
            progress.itemEventIds = [
                ...itemEventIds,
                ...previousItemEventIds.slice(itemEventIds.length),
            ];
            htmlLink ??= event.htmlLink ?? null;
        }

        // 이번에 쓰지 않은 예전 항목 일정 정리
        for (const staleId of previousItemEventIds.slice(scheduled.length)) {
            if (!staleId || itemEventIds.includes(staleId)) continue;
            await deleteTeamCalendarTaskEvent({
                accessToken,
                calendarId,
                eventId: staleId,
            });
        }
        progress.itemEventIds = itemEventIds;

        if (!baseEventId && itemEventIds.length === 0) {
            throw new TeamCalendarSyncError(
                "팀 캘린더에 표시할 업무 내용이 없습니다",
            );
        }

        return { baseEventId, itemEventIds, htmlLink };
    }

    try {
        return await syncEvents();
    } catch (error) {
        // 설정·필수값 누락은 아무것도 만들지 않았으므로 그대로 올린다.
        if (error instanceof TeamCalendarSyncError) throw error;
        throw new TeamCalendarPartialSyncError(error, progress);
    }
}

export async function deleteTeamCalendarTaskEvent(params: {
    accessToken: string;
    calendarId: string;
    eventId: string;
}) {
    const { accessToken, calendarId, eventId } = params;
    const res = await fetchWithTimeout(
        `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    if (res.status === 404 || res.status === 410) return;
    if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
            json.error?.message || "Failed to delete team calendar event",
        );
    }
}

function teamEventSummary(input: TeamCalendarEventInput) {
    const title = input.title.trim();
    if (input.eventType === "leave") {
        return `[휴가] ${input.targetMember ?? ""}${title ? ` - ${title}` : ""}`.trim();
    }
    if (input.eventType === "annual_leave") {
        return `[연차] ${input.targetMember ?? ""}${title ? ` - ${title}` : ""}`.trim();
    }
    if (input.eventType === "offset") {
        return `[시차] ${input.targetMember ?? ""}${title ? ` - ${title}` : ""}`.trim();
    }
    if (input.eventType === "meeting") {
        return `[회의] ${title || "팀 회의"}`;
    }
    return title;
}

export async function createTeamCalendarEvent(params: {
    accessToken: string;
    calendarId: string;
    input: TeamCalendarEventInput;
    /** 멱등 재시도용 식별자. 제공 시 Google Calendar event ID로 사용됩니다. */
    idempotencyKey?: string;
}) {
    const { accessToken, calendarId, input, idempotencyKey } = params;
    const allDay = input.eventType === "annual_leave";
    const endDate = input.endDate || input.date;
    if (!allDay && !input.startTime) {
        throw new TeamCalendarSyncError("시간 일정은 시작 시간이 필요합니다");
    }
    const event: Record<string, unknown> = {
        summary: teamEventSummary(input),
        description: "project-alarm-service에서 생성한 팀 일정입니다.",
        location:
            input.eventType === "meeting"
                ? input.meetingRoom || undefined
                : undefined,
        start: allDay
            ? { date: input.date }
            : { dateTime: `${input.date}T${input.startTime}:00+09:00` },
        end: allDay
            ? { date: toGoogleAllDayEnd(endDate) }
            : {
                  dateTime: `${endDate}T${input.endTime || input.startTime}:00+09:00`,
              },
        extendedProperties: {
            private: {
                source: "project-alarm-service",
                eventType: input.eventType,
                member: input.targetMember ?? "",
                attendeeMembers: (input.attendeeMembers ?? []).join(","),
            },
        },
    };
    if (idempotencyKey) {
        event.id = idempotencyKey;
    }

    const encodedCalendarId = encodeURIComponent(calendarId);
    const res = await fetchWithTimeout(
        `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodedCalendarId}/events`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(event),
        },
    );

    // 동일 idempotencyKey로 재시도 시 기존 이벤트를 반환합니다.
    if (res.status === 409 && idempotencyKey) {
        const existing = await fetchWithTimeout(
            `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodedCalendarId}/events/${encodeURIComponent(idempotencyKey)}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const existingJson = await existing.json();
        if (existing.ok) return existingJson as GoogleCalendarEvent;
    }

    const json = await res.json();
    if (!res.ok) {
        throw new Error(
            json.error?.message || "Failed to create team calendar event",
        );
    }
    return json as GoogleCalendarEvent;
}

export async function getTeamCalendarAccessToken(
    supabase: Parameters<typeof getValidCalendarAccessToken>[0],
    teamId: string,
    connection: GoogleCalendarConnection,
) {
    return getValidCalendarAccessToken(supabase, teamId, connection);
}
