import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerCurrentTeamRole } from "@/infrastructure/supabase/server";
import { buildGoogleCalendarAuthUrl } from "@/infrastructure/google-calendar";
import { internalErrorResponse } from "@/shared/server/apiResponse";

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
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 10 * 60,
        });
        res.cookies.set("google_calendar_oauth_team", teamId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 10 * 60,
        });
        return res;
    } catch (error) {
        return internalErrorResponse(
            "google-calendar-connect",
            error,
            "Google Calendar 연결을 시작하지 못했습니다.",
        );
    }
}
