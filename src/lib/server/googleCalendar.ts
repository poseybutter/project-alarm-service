const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3";

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
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    show_on_team_calendar?: boolean | null;
    team_calendar_event_id?: string | null;
    team_calendar_id?: string | null;
};

type MemberCalendarSetting = {
    member: string;
    calendar_id: string;
};

const MEMBER_EVENT_COLOR_IDS: Record<string, string> = {
    TEAM_MEMBER_4: "5", // banana / yellow
    TEAM_MEMBER_1: "2", // sage / light green
    TEAM_MEMBER_2: "9", // blueberry / blue
    TEAM_MEMBER_3: "6", // tangerine / orange
};

export function getGoogleCalendarConfig() {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "";
    const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
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
            "openid",
            "email",
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
                eq: (column: string, value: unknown) => {
                    eq: (column: string, value: unknown) => PromiseLike<{ error: { message: string } | null }>;
                };
            };
        };
    },
    teamId: string,
    connection: GoogleCalendarConnection,
) {
    let accessToken = connection.access_token;
    const expiresAt = connection.expires_at
        ? new Date(connection.expires_at).getTime()
        : 0;

    if (accessToken && expiresAt >= Date.now() + 60_000) {
        return accessToken;
    }

    if (!connection.refresh_token) {
        throw new Error("Calendar refresh token is missing");
    }

    const refreshed = await refreshGoogleCalendarToken(connection.refresh_token);
    accessToken = refreshed.access_token;
    const { error } = await supabase
        .from("agent_calendar_connections")
        .update({
            access_token: refreshed.access_token,
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
    const res = await fetch(GOOGLE_TOKEN_URL, {
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
        throw new Error(json.error_description || json.error || "Token exchange failed");
    }
    return json as GoogleTokenResponse;
}

export async function refreshGoogleCalendarToken(refreshToken: string) {
    const { clientId, clientSecret } = getGoogleCalendarConfig();
    const res = await fetch(GOOGLE_TOKEN_URL, {
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
        throw new Error(json.error_description || json.error || "Token refresh failed");
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

    const res = await fetch(`${GOOGLE_EVENTS_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) {
        throw new Error(json.error?.message || "Failed to fetch calendar events");
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

    const res = await fetch(
        `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    const json = await res.json();
    if (!res.ok) {
        throw new Error(json.error?.message || "Failed to fetch calendar events");
    }
    return (json.items ?? []) as GoogleCalendarEvent[];
}

function eventDateTime(value: { date?: string; dateTime?: string } | undefined) {
    if (!value) return { at: null, allDay: false };
    if (value.dateTime) return { at: value.dateTime, allDay: false };
    if (value.date) return { at: `${value.date}T00:00:00+09:00`, allDay: true };
    return { at: null, allDay: false };
}

export async function syncTodayGoogleCalendarEvents(
    supabase: {
        from: (table: string) => {
            update: (values: Record<string, unknown>) => {
                eq: (column: string, value: unknown) => {
                    eq: (column: string, value: unknown) => PromiseLike<{ error: { message: string } | null }>;
                };
            };
            delete: () => {
                eq: (column: string, value: unknown) => {
                    eq: (column: string, value: unknown) => {
                        eq: (column: string, value: unknown) => {
                            gte: (column: string, value: unknown) => {
                                lt: (column: string, value: unknown) => PromiseLike<{ error: { message: string } | null }>;
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
        .select("id, member, email, title, starts_at, ends_at, all_day, location, html_link");
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

function extractMemberFromTeamEventTitle(title: string, players: TeamCalendarPlayer[]) {
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
        const taggedPlayers = players.filter((player) => memberSet.has(player.name));
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

function displayTitleForTeamEvent(event: GoogleCalendarEvent, players: TeamCalendarPlayer[]) {
    const title = event.summary || "(제목 없음)";
    const type = teamCalendarEventType(event);
    if (type === "leave" || type === "annual_leave" || type === "offset") {
        const member =
            event.extendedProperties?.private?.member ||
            event.extendedProperties?.shared?.member ||
            extractMemberFromTeamEventTitle(title, players);
        return member && !title.includes(member) ? `${title} - ${member}` : title;
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
    supabase: any,
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

    const { data: players, error: playersError } = await supabase
        .from("players")
        .select("name, email")
        .eq("team_id", teamId)
        .eq("status", "active");
    if (playersError) throw new Error(playersError.message);

    const teamPlayers = ((players ?? []) as TeamCalendarPlayer[]).filter(
        (player) => player.name && player.email,
    );
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
                    title: event.summary || "(?쒕ぉ ?놁쓬)",
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
        .select("id, member, email, title, starts_at, ends_at, all_day, location, html_link");
    if (error) throw new Error(error.message);

    return data ?? [];
}

function toGoogleAllDayEnd(date: string) {
    const value = new Date(`${date}T00:00:00+09:00`);
    value.setDate(value.getDate() + 1);
    return value.toISOString().slice(0, 10);
}

function buildTeamCalendarEvent(task: TeamCalendarTaskInput) {
    const startDate = task.start_date || task.end_date;
    const endDate = task.end_date || task.start_date || startDate;
    if (!startDate) {
        throw new Error("팀 캘린더에 표시하려면 업무 기간 또는 마감일이 필요합니다");
    }

    const title = task.content?.trim() || "업무";
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
        colorId: MEMBER_EVENT_COLOR_IDS[task.member] ?? undefined,
    };
}

export async function upsertTeamCalendarTaskEvent(params: {
    accessToken: string;
    calendarId: string;
    task: TeamCalendarTaskInput;
}) {
    const { accessToken, calendarId, task } = params;
    const event = buildTeamCalendarEvent(task);
    const encodedCalendarId = encodeURIComponent(calendarId);
    const eventId = task.team_calendar_event_id;
    const url = eventId
        ? `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodedCalendarId}/events/${encodeURIComponent(eventId)}`
        : `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodedCalendarId}/events`;

    const res = await fetch(url, {
        method: eventId ? "PATCH" : "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
    });
    const json = await res.json();
    if (!res.ok) {
        throw new Error(json.error?.message || "Failed to sync team calendar event");
    }
    return json as GoogleCalendarEvent;
}

export async function deleteTeamCalendarTaskEvent(params: {
    accessToken: string;
    calendarId: string;
    eventId: string;
}) {
    const { accessToken, calendarId, eventId } = params;
    const res = await fetch(
        `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    if (res.status === 404 || res.status === 410) return;
    if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || "Failed to delete team calendar event");
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
}) {
    const { accessToken, calendarId, input } = params;
    const allDay = input.eventType === "annual_leave";
    const endDate = input.endDate || input.date;
    if (!allDay && !input.startTime) {
        throw new Error("시간 일정은 시작 시간이 필요합니다");
    }
    const event = {
        summary: teamEventSummary(input),
        description: "project-alarm-service에서 생성한 팀 일정입니다.",
        location: input.eventType === "meeting" ? input.meetingRoom || undefined : undefined,
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

    const res = await fetch(
        `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(event),
        },
    );
    const json = await res.json();
    if (!res.ok) {
        throw new Error(json.error?.message || "Failed to create team calendar event");
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
