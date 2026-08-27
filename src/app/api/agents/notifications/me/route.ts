import { NextResponse } from "next/server";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import {
    buildNotificationSuggestions,
    type CalendarEventInput,
    type QuestBriefingInput,
} from "@/features/agents/server/notificationAgent";
import {
    syncTodayGoogleCalendarEvents,
    type GoogleCalendarConnection,
} from "@/infrastructure/google-calendar";
import type { Accessibility, Task } from "@/shared/types";
import { internalErrorResponse } from "@/shared/server/apiResponse";

export async function POST() {
    const { supabase, user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const serviceSupabase = createServiceSupabaseClient();
        const { data: player, error: playerError } = await supabase
            .from("players")
            .select("name")
            .eq("team_id", teamId)
            .eq("email", user.email)
            .maybeSingle();
        if (playerError) throw playerError;
        if (!player?.name) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data: calendarConnection, error: connectionError } =
            await serviceSupabase
                .from("agent_calendar_connections")
                .select("member, email, access_token, refresh_token, expires_at")
                .eq("team_id", teamId)
                .eq("email", user.email)
                .maybeSingle();
        if (connectionError) throw connectionError;

        const personalCalendarEvents = calendarConnection
            ? await syncTodayGoogleCalendarEvents(serviceSupabase, {
                  teamId,
                  connection: calendarConnection as GoogleCalendarConnection,
              })
            : [];
        const teamCalendarEvents: CalendarEventInput[] = [];

        const [
            { data: tasks, error: taskError },
            { data: accessibility, error: accError },
            { data: quests, error: questError },
        ] = await Promise.all([
            serviceSupabase
                .from("tasks")
                .select("*")
                .eq("team_id", teamId)
                .eq("member", player.name),
            serviceSupabase
                .from("accessibility")
                .select("*")
                .eq("team_id", teamId)
                .eq("member", player.name)
                .order("end_date", { ascending: true }),
            serviceSupabase
                .from("quests")
                .select("id, member, content, proj, end_date, task_id, status")
                .eq("team_id", teamId)
                .eq("member", player.name)
                .is("task_id", null)
                .order("order_index", { ascending: true, nullsFirst: false })
                .order("created_at", { ascending: true }),
        ]);

        if (taskError || accError || questError) {
            throw taskError ?? accError ?? questError;
        }

        const suggestions = buildNotificationSuggestions({
            teamId,
            tasks: (tasks ?? []) as Task[],
            accessibility: (accessibility ?? []) as Accessibility[],
            calendarEvents: [
                ...(personalCalendarEvents ?? []),
                ...(teamCalendarEvents ?? []),
            ] as CalendarEventInput[],
            quests: (quests ?? []) as QuestBriefingInput[],
            createdBy: user.email,
        });

        const rows = suggestions.map((suggestion) => ({
            ...suggestion,
            status: "pending",
            reviewed_by: null,
            reviewed_at: null,
        }));

        if (rows.length === 0) {
            await serviceSupabase
                .from("agent_suggestions")
                .update({
                    status: "dismissed",
                    reviewed_by: user.email,
                    reviewed_at: new Date().toISOString(),
                })
                .eq("team_id", teamId)
                .eq("agent_type", "notification")
                .eq("status", "pending")
                .eq("payload->>recipientMember", player.name);

            return NextResponse.json({ suggestions: [] });
        }

        const { data: refreshed, error: refreshError } = await serviceSupabase
            .from("agent_suggestions")
            .upsert(rows, { onConflict: "team_id,dedupe_key" })
            .select("*");
        if (refreshError) throw refreshError;

        const refreshedIds = (refreshed ?? []).map((row) => row.id);
        let cleanup = serviceSupabase
            .from("agent_suggestions")
            .update({
                status: "dismissed",
                reviewed_by: user.email,
                reviewed_at: new Date().toISOString(),
            })
            .eq("team_id", teamId)
            .eq("agent_type", "notification")
            .eq("status", "pending")
            .eq("payload->>recipientMember", player.name);

        if (refreshedIds.length > 0) {
            cleanup = cleanup.not("id", "in", `(${refreshedIds.join(",")})`);
        }

        const { error: cleanupError } = await cleanup;
        if (cleanupError) throw cleanupError;

        return NextResponse.json({ suggestions: refreshed ?? [] });
    } catch (error) {
        return internalErrorResponse(
            "personal-briefing-refresh",
            error,
            "개인 브리핑을 갱신하지 못했습니다.",
        );
    }
}
