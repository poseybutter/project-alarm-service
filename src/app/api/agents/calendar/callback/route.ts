import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { TEAM_ID } from "@/lib/constants";
import {
    createServiceSupabaseClient,
    getServerUser,
} from "@/lib/serverSupabase";
import { exchangeGoogleCalendarCode } from "@/lib/server/googleCalendar";

export async function GET(req: NextRequest) {
    const origin = req.nextUrl.origin;
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const store = await cookies();
    const expectedState = store.get("google_calendar_oauth_state")?.value;

    if (!code || !state || state !== expectedState) {
        return NextResponse.redirect(`${origin}/agents?calendar=invalid_state`);
    }

    const { supabase, user } = await getServerUser();
    if (!user?.email) {
        return NextResponse.redirect(`${origin}/login`);
    }

    try {
        const { data: player, error: playerError } = await supabase
            .from("players")
            .select("name")
            .eq("team_id", TEAM_ID)
            .eq("email", user.email)
            .maybeSingle();

        if (playerError) throw playerError;
        if (!player?.name) {
            return NextResponse.redirect(`${origin}/agents?calendar=no_player`);
        }

        const token = await exchangeGoogleCalendarCode(code);
        const serviceSupabase = createServiceSupabaseClient();
        const expiresAt = new Date(
            Date.now() + token.expires_in * 1000,
        ).toISOString();

        const { error } = await serviceSupabase
            .from("agent_calendar_connections")
            .upsert(
                {
                    team_id: TEAM_ID,
                    member: player.name,
                    email: user.email,
                    google_email: user.email,
                    access_token: token.access_token,
                    refresh_token: token.refresh_token,
                    token_type: token.token_type ?? null,
                    scope: token.scope ?? null,
                    expires_at: expiresAt,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "team_id,email" },
            );

        if (error) throw error;

        const res = NextResponse.redirect(`${origin}/agents?calendar=connected`);
        res.cookies.set("google_calendar_oauth_state", "", {
            path: "/",
            maxAge: 0,
        });
        return res;
    } catch (err) {
        const message =
            err instanceof Error ? encodeURIComponent(err.message) : "failed";
        return NextResponse.redirect(`${origin}/agents?calendar=${message}`);
    }
}
