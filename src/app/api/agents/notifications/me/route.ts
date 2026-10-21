import { NextResponse } from "next/server";
import {
    consumeSharedRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/shared/server/rateLimit";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import { requireAdminSession } from "@/features/admin/server/adminRepository";
import { resolveTeamMember } from "@/features/identity/server/identityRepository";
import {
    buildNotificationSuggestions,
    type CalendarEventInput,
    type QuestBriefingInput,
} from "@/features/agents/server/notificationAgent";
import {
    syncTodayGoogleCalendarEvents,
    syncTodayTeamCalendarEvents,
    todayKstWindow,
    type GoogleCalendarConnection,
} from "@/infrastructure/google-calendar";
import type { Accessibility, Task } from "@/shared/types";
import { internalErrorResponse } from "@/shared/server/apiResponse";

export async function POST(req: Request) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Google Calendar 동기화를 동반하므로 남용을 막는다 (calendar-sync 와 동일 기준)
    const rate = await consumeSharedRateLimit(
        requestRateLimitKey(req, "agent-notifications-me", user.email),
        { limit: 10, windowMs: 5 * 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    try {
        const serviceSupabase = createServiceSupabaseClient();
        const member = await resolveTeamMember(serviceSupabase, user.email, teamId);
        if (!member) {
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

        // 개인 캘린더 오류(토큰 만료 등)로 브리핑 전체가 실패하지 않도록 빈 목록으로 대체한다.
        const personalCalendarEvents = calendarConnection
            ? await syncTodayGoogleCalendarEvents(serviceSupabase, {
                  teamId,
                  connection: calendarConnection as GoogleCalendarConnection,
              }).catch((err) => {
                  console.error("[personal-briefing-calendar]", err);
                  return [] as CalendarEventInput[];
              })
            : [];

        // 팀 캘린더 동기화는 팀 전체 데이터를 다시 쓰므로 연동 관리 권한이 있는 관리자만 실행한다.
        // 그 외 멤버는 마지막으로 동기화된 결과 중 본인 일정만 읽는다.
        const canSyncTeamCalendar = await requireAdminSession(
            teamId,
            "integrations.manage",
        ).then(
            () => true,
            () => false,
        );
        let teamCalendarEvents: CalendarEventInput[];
        if (canSyncTeamCalendar) {
            teamCalendarEvents = await syncTodayTeamCalendarEvents(
                serviceSupabase,
                { teamId },
            ).catch(() => [] as CalendarEventInput[]);
        } else {
            const { timeMin, timeMax } = todayKstWindow();
            const { data: storedTeamEvents, error: storedTeamEventsError } =
                await serviceSupabase
                    .from("agent_calendar_events")
                    .select(
                        "id, member, email, title, starts_at, ends_at, all_day, location, html_link, google_event_id",
                    )
                    .eq("team_id", teamId)
                    .eq("email", user.email)
                    .neq("calendar_id", "primary")
                    .lt("starts_at", timeMax)
                    .gt("ends_at", timeMin);
            teamCalendarEvents = storedTeamEventsError
                ? []
                : ((storedTeamEvents ?? []) as CalendarEventInput[]);
        }
        // 팀 동기화 결과에는 모든 멤버 일정이 섞여 있으므로 호출자 본인 것만 남긴다.
        const ownCalendarEvents = [
            ...(personalCalendarEvents ?? []),
            ...(teamCalendarEvents ?? []),
        ].filter(
            (event) =>
                event.member === member.name ||
                event.email?.toLowerCase() === user.email?.toLowerCase(),
        ) as CalendarEventInput[];

        const [
            { data: tasks, error: taskError },
            { data: accessibility, error: accError },
            { data: quests, error: questError },
        ] = await Promise.all([
            serviceSupabase
                .from("tasks")
                .select("*")
                .eq("team_id", teamId)
                .eq("member", member.name),
            serviceSupabase
                .from("accessibility")
                .select("*")
                .eq("team_id", teamId)
                .eq("member", member.name)
                .order("end_date", { ascending: true }),
            serviceSupabase
                .from("quests")
                .select("id, member, content, proj, end_date, task_id, status")
                .eq("team_id", teamId)
                .eq("member", member.name)
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
            calendarEvents: ownCalendarEvents,
            quests: (quests ?? []) as QuestBriefingInput[],
            createdBy: user.email,
        }).filter((suggestion) => {
            // 호출자 본인에게 가는 브리핑만 저장·반환한다.
            const payload = suggestion.payload as { recipientMember?: unknown };
            return payload.recipientMember === member.name;
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
                .eq("payload->>recipientMember", member.name);

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
            .eq("payload->>recipientMember", member.name);

        if (refreshedIds.length > 0) {
            cleanup = cleanup.not("id", "in", `(${refreshedIds.map((id) => String(Number(id))).join(",")})`);
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
