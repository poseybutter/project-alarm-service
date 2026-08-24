import { NextResponse } from "next/server";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/lib/serverSupabase";

export async function GET() {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const serviceSupabase = createServiceSupabaseClient();
        const { data, error } = await serviceSupabase
            .from("agent_calendar_connections")
            .select("member, email, google_email, connected_at, updated_at")
            .eq("team_id", teamId)
            .eq("email", user.email)
            .maybeSingle();

        if (error) throw error;
        return NextResponse.json({
            connected: Boolean(data),
            connection: data ?? null,
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to load status";
        return NextResponse.json({ message }, { status: 500 });
    }
}
