import { NextResponse, type NextRequest } from "next/server";
import { TEAM_ID } from "@/lib/constants";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import {
    buildNotificationSuggestions,
    type CalendarEventInput,
    type QuestBriefingInput,
} from "@/lib/agents/notificationAgent";
import { hasRecentNotificationDelivery } from "@/lib/agents/notificationDeliveries";
import { sendGoogleChatMessage } from "@/lib/server/googleChat";
import type { AgentSuggestion, NotificationSuggestionPayload } from "@/lib/agents/types";
import type { Accessibility, Task } from "@/lib/types";

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

function isAuthorized(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret && process.env.NODE_ENV !== "production") return true;
    if (!secret) return false;
    return req.headers.get("authorization") === `Bearer ${secret}`;
}

function todayKstYmd(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
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
    const diff = currentKstMinutes(now) - settingMinutes(settingTime);
    return diff >= 0 && diff < 5;
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
    const [
        { data: tasks, error: taskError },
        { data: accessibility, error: accError },
        { data: calendarEvents, error: calendarError },
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
            .from("agent_calendar_events")
            .select(
                "id, member, email, title, starts_at, ends_at, all_day, location, html_link",
            )
            .eq("team_id", TEAM_ID)
            .eq("email", setting.email)
            .order("starts_at", { ascending: true }),
        supabase
            .from("quests")
            .select("id, member, content, proj, end_date, task_id, status")
            .eq("team_id", TEAM_ID)
            .eq("member", setting.member)
            .is("task_id", null)
            .order("order_index", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true }),
    ]);

    if (taskError || accError || calendarError || questError) {
        throw taskError ?? accError ?? calendarError ?? questError;
    }

    return buildNotificationSuggestions({
        tasks: (tasks ?? []) as Task[],
        accessibility: (accessibility ?? []) as Accessibility[],
        calendarEvents: (calendarEvents ?? []) as CalendarEventInput[],
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
        const sent: Array<{ member: string; title: string }> = [];
        const skipped: Array<{ member: string; reason: string }> = [];
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
            if (!isDueNow(setting.morning_send_time)) {
                skipped.push({ member: setting.member, reason: "not_due" });
                continue;
            }

            const dedupeKey = `morning-briefing:${setting.email}:${today}`;
            if (
                await hasRecentNotificationDelivery(supabase, {
                    teamId: TEAM_ID,
                    dedupeKey,
                    cooldownHours: 24,
                })
            ) {
                skipped.push({ member: setting.member, reason: "already_sent" });
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
                skipped.push({ member: setting.member, reason: "missing_webhook" });
                continue;
            }

            const { data: existingSuggestions, error: suggestionError } =
                await supabase
                    .from("agent_suggestions")
                    .select("*")
                    .eq("team_id", TEAM_ID)
                    .eq("agent_type", "notification")
                    .eq("status", "pending")
                    .eq("payload->>recipientMember", setting.member)
                    .order("created_at", { ascending: false })
                    .limit(1);
            if (suggestionError) throw suggestionError;

            let suggestion = (existingSuggestions?.[0] ?? null) as AgentSuggestion | null;
            if (!suggestion) {
                const fresh = await buildFreshSuggestion(supabase, setting);
                if (!fresh) {
                    skipped.push({ member: setting.member, reason: "empty_briefing" });
                    continue;
                }
                const { data: created, error: createError } = await supabase
                    .from("agent_suggestions")
                    .upsert(
                        {
                            ...fresh,
                            status: "pending",
                        },
                        { onConflict: "team_id,dedupe_key" },
                    )
                    .select("*")
                    .maybeSingle();
                if (createError) throw createError;
                suggestion = created as AgentSuggestion;
            }

            if (!isNotificationPayload(suggestion.payload)) {
                skipped.push({ member: setting.member, reason: "invalid_payload" });
                continue;
            }

            await sendGoogleChatMessage({
                text: suggestion.payload.text,
                card: suggestion.payload.card,
                channel: "personal_dm",
                recipientMember: setting.member,
                webhookUrl: webhookRow.webhook_url,
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

            await supabase
                .from("agent_suggestions")
                .update({
                    status: "applied",
                    reviewed_by: "morning-briefing-cron",
                    reviewed_at: new Date().toISOString(),
                })
                .eq("team_id", TEAM_ID)
                .eq("id", suggestion.id);

            sent.push({ member: setting.member, title: suggestion.title });
        }

        return NextResponse.json({ sent, skipped });
    } catch (err) {
        const message =
            err instanceof Error
                ? err.message
                : "Failed to send morning briefings";
        return NextResponse.json({ message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    return handleMorningBriefings(req);
}

export async function POST(req: NextRequest) {
    return handleMorningBriefings(req);
}
