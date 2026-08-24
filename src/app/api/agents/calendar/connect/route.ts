import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerCurrentTeamRole } from "@/lib/serverSupabase";
import { buildGoogleCalendarAuthUrl } from "@/lib/server/googleCalendar";

export async function GET() {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const state = randomUUID();
        const url = buildGoogleCalendarAuthUrl(state);
        const res = NextResponse.redirect(url);
        res.cookies.set("google_calendar_oauth_state", state, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 10 * 60,
        });
        res.cookies.set("google_calendar_oauth_team", teamId, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 10 * 60,
        });
        return res;
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to start OAuth";
        return NextResponse.json({ message }, { status: 500 });
    }
}
