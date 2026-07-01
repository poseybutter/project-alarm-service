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
