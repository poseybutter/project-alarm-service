import { NextResponse } from "next/server";
import { TEAM_ID } from "@/lib/constants";
import {
    createServiceSupabaseClient,
    getServerUser,
} from "@/lib/serverSupabase";

export async function GET() {
    const { user } = await getServerUser();
    if (!user?.email) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const serviceSupabase = createServiceSupabaseClient();
        const { data, error } = await serviceSupabase
            .from("agent_calendar_connections")
            .select("member, email, google_email, connected_at, updated_at")
            .eq("team_id", TEAM_ID)
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
