import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { exchangeGoogleCalendarCode } from "@/infrastructure/google-calendar";
import { encryptIntegrationToken } from "@/infrastructure/security/tokenEncryption";

export async function GET(req: NextRequest) {
    const origin = req.nextUrl.origin;
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const store = await cookies();
    const expectedState = store.get("google_calendar_oauth_state")?.value;
    const teamId = store.get("google_calendar_oauth_team")?.value;

    if (!code || !state || state !== expectedState || !teamId) {
        return NextResponse.redirect(`${origin}/agents?calendar=invalid_state`);
    }

    const { supabase, user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.redirect(`${origin}/login`);
    }

    try {
        const { data: player, error: playerError } = await supabase
            .from("players")
            .select("name")
            .eq("team_id", teamId)
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
                    team_id: teamId,
                    member: player.name,
                    email: user.email,
                    google_email: user.email,
                    access_token: encryptIntegrationToken(token.access_token),
                    ...(token.refresh_token
                        ? {
                              refresh_token: encryptIntegrationToken(
                                  token.refresh_token,
                              ),
                          }
                        : {}),
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
        res.cookies.set("google_calendar_oauth_team", "", {
            path: "/",
            maxAge: 0,
        });
        return res;
    } catch (error) {
        const requestId = crypto.randomUUID();
        console.error(`[google-calendar-callback:${requestId}]`, error);
        return NextResponse.redirect(
            `${origin}/agents?calendar=connection_failed&requestId=${encodeURIComponent(requestId)}`,
        );
    }
}
