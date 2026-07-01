import { NextResponse, type NextRequest } from "next/server";
import { TEAM_ID } from "@/lib/constants";
import { getServerUserRole } from "@/lib/serverSupabase";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

async function getCurrentPlayer(
    supabase: Awaited<ReturnType<typeof getServerUserRole>>["supabase"],
    email: string,
) {
    const { data, error } = await supabase
        .from("players")
        .select("name")
        .eq("team_id", TEAM_ID)
        .eq("email", email)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function GET() {
    const { supabase, user } = await getServerUserRole(TEAM_ID);
    if (!user?.email) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const player = await getCurrentPlayer(supabase, user.email);
        if (!player?.name) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data, error } = await supabase
            .from("agent_member_notification_settings")
            .select("morning_send_time, morning_enabled")
            .eq("team_id", TEAM_ID)
            .eq("email", user.email)
            .maybeSingle();
        if (error) throw error;

        return NextResponse.json({
            settings: data ?? {
                morning_send_time: "09:00:00",
                morning_enabled: true,
            },
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to load settings";
        return NextResponse.json({ message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const { supabase, user } = await getServerUserRole(TEAM_ID);
    if (!user?.email) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body: {
        morningSendTime?: string;
        morningEnabled?: boolean;
    };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const morningSendTime = body.morningSendTime ?? "09:00";
    if (!TIME_PATTERN.test(morningSendTime)) {
        return NextResponse.json(
            { message: "morningSendTime must be HH:mm" },
            { status: 400 },
        );
    }

    try {
        const player = await getCurrentPlayer(supabase, user.email);
        if (!player?.name) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data, error } = await supabase
            .from("agent_member_notification_settings")
            .upsert(
                {
                    team_id: TEAM_ID,
                    member: player.name,
                    email: user.email,
                    morning_send_time: morningSendTime,
                    morning_enabled: body.morningEnabled ?? true,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "team_id,email" },
            )
            .select("morning_send_time, morning_enabled")
            .maybeSingle();

        if (error) throw error;
        return NextResponse.json({ settings: data });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to save settings";
        return NextResponse.json({ message }, { status: 500 });
    }
}
