const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events";

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
        scope: "https://www.googleapis.com/auth/calendar.readonly openid email",
        access_type: "offline",
        prompt: "consent",
        state,
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
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
    let accessToken = connection.access_token;
    const expiresAt = connection.expires_at
        ? new Date(connection.expires_at).getTime()
        : 0;

    if (!accessToken || expiresAt < Date.now() + 60_000) {
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
    }

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
