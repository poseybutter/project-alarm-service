import { NextResponse, type NextRequest } from "next/server";
import { TEAM_ID } from "@/shared/constants";
import { createServiceSupabaseClient } from "@/infrastructure/supabase/server";
import {
    buildNotificationSuggestions,
    type CalendarEventInput,
    type QuestBriefingInput,
} from "@/features/agents/server/notificationAgent";
import { hasRecentNotificationDelivery } from "@/features/agents/server/notificationDeliveries";
import { sendGoogleChatMessage } from "@/infrastructure/google-chat";
import {
    syncTodayGoogleCalendarEvents,
    syncTodayTeamCalendarEvents,
    type GoogleCalendarConnection,
} from "@/infrastructure/google-calendar";
import type { AgentSuggestion, NotificationSuggestionPayload } from "@/features/agents/server/types";
import type { Accessibility, Task } from "@/shared/types";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { decryptIntegrationToken } from "@/infrastructure/security/tokenEncryption";

type NotificationSetting = {
    member: string;
    email: string;
    morning_send_time: string;
    morning_enabled: boolean;
};

type PlayerNotificationTarget = {
    name: string;
    email: string | null;
};

const DEFAULT_MORNING_SEND_TIME = "08:30:00";
const PUBLIC_HOLIDAYS_API_BASE_URL = "https://date.nager.at/api/v3/PublicHolidays";

function isAuthorized(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret && process.env.NODE_ENV !== "production") return true;
    if (secret && req.headers.get("authorization") === `Bearer ${secret}`) {
        return true;
    }

    return false;
}

function todayKstYmd(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}

function kstDateInfo(now = new Date()) {
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const year = kstNow.getUTCFullYear();
    const month = String(kstNow.getUTCMonth() + 1).padStart(2, "0");
    const day = String(kstNow.getUTCDate()).padStart(2, "0");
    return {
        year,
        ymd: `${year}-${month}-${day}`,
        weekday: kstNow.getUTCDay(),
    };
}

async function getKoreanBusinessDayStatus(now = new Date()) {
    const { year, ymd, weekday } = kstDateInfo(now);
    if (weekday === 0 || weekday === 6) {
        return { businessDay: false, reason: "weekend" };
    }

    const res = await fetch(`${PUBLIC_HOLIDAYS_API_BASE_URL}/${year}/KR`, {
        next: { revalidate: 24 * 60 * 60 },
    });
    if (!res.ok) {
        return { businessDay: false, reason: "holiday_check_failed" };
    }

    const holidays = (await res.json()) as Array<{ date?: string }>;
    const isHoliday = holidays.some((holiday) => holiday.date === ymd);
    return {
        businessDay: !isHoliday,
        reason: isHoliday ? "public_holiday" : null,
    };
}

function currentKstMinutes(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(
        parts.find((part) => part.type === "minute")?.value ?? 0,
    );
    return hour * 60 + minute;
}

function settingMinutes(value: string) {
    const [hour, minute] = value.slice(0, 5).split(":").map(Number);
    return hour * 60 + minute;
}

function isDueNow(settingTime: string, now = new Date()) {
    return currentKstMinutes(now) >= settingMinutes(settingTime);
}

function isForceSend(req: NextRequest) {
    return req.nextUrl.searchParams.get("force") === "1";
}

function isNotificationPayload(
    payload: Record<string, unknown>,
): payload is NotificationSuggestionPayload {
    return typeof payload.text === "string" && payload.text.trim().length > 0;
}

async function buildFreshSuggestion(
    supabase: ReturnType<typeof createServiceSupabaseClient>,
    setting: NotificationSetting,
) {
    const { data: calendarConnection, error: connectionError } = await supabase
        .from("agent_calendar_connections")
        .select("member, email, access_token, refresh_token, expires_at")
        .eq("team_id", TEAM_ID)
        .eq("email", setting.email)
        .maybeSingle();
    if (connectionError) throw connectionError;

    const personalCalendarEvents = calendarConnection
        ? await syncTodayGoogleCalendarEvents(supabase, {
              teamId: TEAM_ID,
              connection: calendarConnection as GoogleCalendarConnection,
          })
        : [];
    const teamCalendarEvents = await syncTodayTeamCalendarEvents(supabase, {
        teamId: TEAM_ID,
    });

    const [
        { data: tasks, error: taskError },
        { data: accessibility, error: accError },
        { data: quests, error: questError },
    ] = await Promise.all([
        supabase
            .from("tasks")
            .select("*")
            .eq("team_id", TEAM_ID)
            .eq("member", setting.member),
        supabase
            .from("accessibility")
            .select("*")
            .eq("team_id", TEAM_ID)
            .eq("member", setting.member)
            .order("end_date", { ascending: true }),
        supabase
            .from("quests")
            .select("id, member, content, proj, end_date, task_id, status")
            .eq("team_id", TEAM_ID)
            .eq("member", setting.member)
            .is("task_id", null)
            .order("order_index", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true }),
    ]);

    if (taskError || accError || questError) {
        throw taskError ?? accError ?? questError;
    }

    return buildNotificationSuggestions({
        teamId: TEAM_ID,
        tasks: (tasks ?? []) as Task[],
        accessibility: (accessibility ?? []) as Accessibility[],
        calendarEvents: [
            ...(personalCalendarEvents ?? []),
            ...(teamCalendarEvents ?? []),
        ] as CalendarEventInput[],
        quests: (quests ?? []) as QuestBriefingInput[],
        createdBy: "morning-briefing-cron",
    }).find((suggestion) => {
        const payload = suggestion.payload as { recipientMember?: unknown };
        return payload.recipientMember === setting.member;
    });
}

async function handleMorningBriefings(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceSupabaseClient();
    const [
        { data: players, error: playersError },
        { data: settings, error: settingsError },
    ] = await Promise.all([
        supabase
            .from("players")
            .select("name, email")
            .eq("team_id", TEAM_ID),
        supabase
            .from("agent_member_notification_settings")
            .select("member, email, morning_send_time, morning_enabled")
            .eq("team_id", TEAM_ID),
    ]);

    if (playersError) {
        return NextResponse.json(
            { message: playersError.message },
            { status: 500 },
        );
    }
    if (settingsError) {
        return NextResponse.json(
            { message: settingsError.message },
            { status: 500 },
        );
    }

    try {
        const today = todayKstYmd();
        const forceSend = isForceSend(req);
        const sent: Array<{ member: string; title: string }> = [];
        const skipped: Array<{ member: string; reason: string }> = [];
        if (!forceSend) {
            const businessDay = await getKoreanBusinessDayStatus();
            if (!businessDay.businessDay) {
                return NextResponse.json({
                    sent,
                    skipped: [
                        {
                            member: "all",
                            reason: businessDay.reason ?? "not_business_day",
                        },
                    ],
                });
            }
        }

        const settingsByEmail = new Map(
            ((settings ?? []) as NotificationSetting[]).map((setting) => [
                setting.email,
                setting,
            ]),
        );
        const targets = ((players ?? []) as PlayerNotificationTarget[])
            .filter((player) => Boolean(player.email))
            .map((player) => {
                const setting = settingsByEmail.get(player.email as string);
                return {
                    member: setting?.member ?? player.name,
                    email: player.email as string,
                    morning_send_time:
                        setting?.morning_send_time ?? DEFAULT_MORNING_SEND_TIME,
                    morning_enabled: setting?.morning_enabled ?? true,
                };
            })
            .filter((setting) => setting.morning_enabled);

        for (const setting of targets) {
            try {
                if (!forceSend && !isDueNow(setting.morning_send_time)) {
                    skipped.push({ member: setting.member, reason: "not_due" });
                    continue;
                }

                const dedupeKey = `morning-briefing:${setting.email}:${today}`;
                if (
                    !forceSend &&
                    (await hasRecentNotificationDelivery(supabase, {
                        teamId: TEAM_ID,
                        dedupeKey,
                        cooldownHours: 24,
                    }))
                ) {
                    skipped.push({
                        member: setting.member,
                        reason: "already_sent",
                    });
                    continue;
                }

                const { data: webhookRow, error: webhookError } = await supabase
                    .from("agent_member_webhooks")
                    .select("webhook_url")
                    .eq("team_id", TEAM_ID)
                    .eq("email", setting.email)
                    .maybeSingle();
                if (webhookError) throw webhookError;
                if (!webhookRow?.webhook_url) {
                    skipped.push({
                        member: setting.member,
                        reason: "missing_webhook",
                    });
                    continue;
                }

                const fresh = await buildFreshSuggestion(supabase, setting);
                if (!fresh) {
                    skipped.push({
                        member: setting.member,
                        reason: "empty_briefing",
                    });
                    continue;
                }

                const { data: created, error: createError } = await supabase
                    .from("agent_suggestions")
                    .upsert(
                        {
                            ...fresh,
                            status: "pending",
                            reviewed_by: null,
                            reviewed_at: null,
                        },
                        { onConflict: "team_id,dedupe_key" },
                    )
                    .select("*")
                    .maybeSingle();
                if (createError) throw createError;
                if (!created) {
                    skipped.push({
                        member: setting.member,
                        reason: "empty_briefing",
                    });
                    continue;
                }

                const suggestion = created as AgentSuggestion;

                const { error: staleCleanupError } = await supabase
                    .from("agent_suggestions")
                    .update({
                        status: "dismissed",
                        reviewed_by: "morning-briefing-cron",
                        reviewed_at: new Date().toISOString(),
                    })
                    .eq("team_id", TEAM_ID)
                    .eq("agent_type", "notification")
                    .eq("status", "pending")
                    .eq("payload->>recipientMember", setting.member)
                    .like(
                        "dedupe_key",
                        `notification:member:${setting.member}:${today}:%`,
                    )
                    .neq("id", suggestion.id);
                if (staleCleanupError) throw staleCleanupError;

                if (!isNotificationPayload(suggestion.payload)) {
                    skipped.push({
                        member: setting.member,
                        reason: "invalid_payload",
                    });
                    continue;
                }

                await sendGoogleChatMessage({
                    text: suggestion.payload.text,
                    card: suggestion.payload.card,
                    channel: "personal_dm",
                    recipientMember: setting.member,
                    webhookUrl: decryptIntegrationToken(webhookRow.webhook_url),
                });

                const { error: deliveryError } = await supabase
                    .from("agent_notification_deliveries")
                    .insert({
                        team_id: TEAM_ID,
                        suggestion_id: suggestion.id,
                        agent_type: "notification",
                        target_table: suggestion.target_table,
                        target_id: suggestion.target_id,
                        dedupe_key: dedupeKey,
                        channel: "personal_dm",
                        recipient_member: setting.member,
                        payload: suggestion.payload,
                        sent_by: "morning-briefing-cron",
                    });
                if (deliveryError) throw deliveryError;

                const { error: suggestionUpdateError } = await supabase
                    .from("agent_suggestions")
                    .update({
                        status: "applied",
                        reviewed_by: "morning-briefing-cron",
                        reviewed_at: new Date().toISOString(),
                    })
                    .eq("team_id", TEAM_ID)
                    .eq("id", suggestion.id);
                if (suggestionUpdateError) throw suggestionUpdateError;

                sent.push({ member: setting.member, title: suggestion.title });
            } catch (err) {
                console.error("[morning-briefing-member]", err);
                skipped.push({
                    member: setting.member,
                    reason: "delivery_failed",
                });
            }
        }

        return NextResponse.json({ sent, skipped });
    } catch (error) {
        return internalErrorResponse(
            "morning-briefings",
            error,
            "아침 브리핑을 발송하지 못했습니다.",
        );
    }
}

export async function GET(req: NextRequest) {
    return handleMorningBriefings(req);
}

export async function POST(req: NextRequest) {
    return handleMorningBriefings(req);
}
