import { NextResponse, type NextRequest } from "next/server";
import {
    consumeSharedRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/shared/server/rateLimit";
import { isCronAuthorized } from "@/shared/server/cronAuth";
import { createServiceSupabaseClient } from "@/infrastructure/supabase/server";
import {
    buildNotificationSuggestions,
    type CalendarEventInput,
    type QuestBriefingInput,
} from "@/features/agents/server/notificationAgent";
import { hasRecentNotificationDelivery } from "@/features/agents/server/notificationDeliveries";
import {
    DeliveryUnknownError,
    sendGoogleChatMessage,
} from "@/infrastructure/google-chat";
import {
    syncTodayGoogleCalendarEvents,
    syncTodayTeamCalendarEvents,
    type GoogleCalendarConnection,
} from "@/infrastructure/google-calendar";
import type { AgentSuggestion, NotificationSuggestionPayload } from "@/features/agents/server/types";
import type { Accessibility, Task } from "@/shared/types";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { mapWithConcurrency } from "@/shared/server/concurrency";
import { decryptIntegrationToken } from "@/infrastructure/security/tokenEncryption";
import { listActiveTeamMembers } from "@/features/identity/server/identityRepository";

// 멤버 수만큼 캘린더 동기화·웹훅 발송을 하므로 기본 실행 시간으로는 잘릴 수 있다.
export const maxDuration = 60;

/** 멤버별 브리핑 동시 처리 한도. 멤버당 Google 호출은 개인 캘린더 1회 수준이라 낮게 잡는다. */
const MEMBER_CONCURRENCY = 3;

type NotificationSetting = {
    member: string;
    email: string;
    morning_send_time: string;
    morning_enabled: boolean;
};

const DEFAULT_MORNING_SEND_TIME = "08:30:00";
/** PostgreSQL unique_violation. V65 의 (team_id, dedupe_key) 고유 인덱스 충돌 = 이미 선점됨. */
const UNIQUE_VIOLATION = "23505";
const PUBLIC_HOLIDAYS_API_BASE_URL = "https://date.nager.at/api/v3/PublicHolidays";


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
        console.error("[morning-briefing] 공휴일 API 응답 실패, 영업일로 간주");
        return { businessDay: true, reason: "holiday_check_failed_fallback" };
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
    teamId: string,
    setting: NotificationSetting,
    // 팀 캘린더는 멤버마다 다르지 않으므로 호출부가 한 번만 동기화해 공유한다.
    loadTeamCalendarEvents: () => ReturnType<typeof syncTodayTeamCalendarEvents>,
) {
    const { data: calendarConnection, error: connectionError } = await supabase
        .from("agent_calendar_connections")
        .select("member, email, access_token, refresh_token, expires_at")
        .eq("team_id", teamId)
        .eq("email", setting.email)
        .maybeSingle();
    if (connectionError) throw connectionError;

    // 개인 캘린더 오류(토큰 만료 등)로 브리핑 전체가 빠지지 않도록 빈 목록으로 대체한다.
    const personalCalendarEvents = calendarConnection
        ? await syncTodayGoogleCalendarEvents(supabase, {
              teamId,
              connection: calendarConnection as GoogleCalendarConnection,
          }).catch((err) => {
              console.error(
                  `[morning-briefing:${teamId}] 개인 캘린더 동기화 실패`,
                  err,
              );
              return [] as CalendarEventInput[];
          })
        : [];
    const teamCalendarEvents = await loadTeamCalendarEvents();

    const [
        { data: tasks, error: taskError },
        { data: accessibility, error: accError },
        { data: quests, error: questError },
    ] = await Promise.all([
        supabase
            .from("tasks")
            .select("*")
            .eq("team_id", teamId)
            .eq("member", setting.member),
        supabase
            .from("accessibility")
            .select("*")
            .eq("team_id", teamId)
            .eq("member", setting.member)
            .order("end_date", { ascending: true }),
        supabase
            .from("quests")
            .select("id, member, content, proj, end_date, task_id, status")
            .eq("team_id", teamId)
            .eq("member", setting.member)
            .is("task_id", null)
            .order("order_index", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true }),
    ]);

    if (taskError || accError || questError) {
        throw taskError ?? accError ?? questError;
    }

    return buildNotificationSuggestions({
        teamId,
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

type BriefingOutcome =
    | { kind: "sent"; member: string; title: string }
    | { kind: "skipped"; member: string; reason: string };

async function processTeam(
    supabase: ReturnType<typeof createServiceSupabaseClient>,
    teamId: string,
    forceSend: boolean,
    today: string,
): Promise<BriefingOutcome[]> {
    let teamMembers;
    try {
        teamMembers = await listActiveTeamMembers(supabase, teamId);
    } catch (err) {
        console.error(`[morning-briefing:${teamId}] 멤버 로드 실패`, err);
        return [];
    }

    const { data: settings, error: settingsError } = await supabase
        .from("agent_member_notification_settings")
        .select("member, email, morning_send_time, morning_enabled")
        .eq("team_id", teamId);
    if (settingsError) {
        console.error(`[morning-briefing:${teamId}] 설정 로드 실패`, settingsError);
        return [];
    }

    const settingsByEmail = new Map(
        ((settings ?? []) as NotificationSetting[]).map((s) => [s.email, s]),
    );
    const targets = teamMembers
        .filter((m) => Boolean(m.email))
        .map((m) => {
            const setting = settingsByEmail.get(m.email);
            return {
                member: setting?.member ?? m.name,
                email: m.email,
                morning_send_time:
                    setting?.morning_send_time ?? DEFAULT_MORNING_SEND_TIME,
                morning_enabled: setting?.morning_enabled ?? true,
            };
        })
        .filter((setting) => setting.morning_enabled);

    // 팀 캘린더 동기화는 멤버마다 같은 결과라 팀당 한 번만 수행한다.
    // 실패도 이번 실행 동안 캐시해, 멤버마다 재시도하며 Google 호출을 반복하지 않는다.
    let teamEventsPromise: ReturnType<typeof syncTodayTeamCalendarEvents> | null =
        null;
    const loadTeamCalendarEvents = () => {
        teamEventsPromise ??= syncTodayTeamCalendarEvents(supabase, {
            teamId,
        }).catch((err) => {
            console.error(
                `[morning-briefing:${teamId}] 팀 캘린더 동기화 실패`,
                err,
            );
            return [];
        });
        return teamEventsPromise;
    };

    const processTarget = async (
        setting: NotificationSetting,
    ): Promise<BriefingOutcome> => {
        try {
            if (!forceSend && !isDueNow(setting.morning_send_time)) {
                return {
                    kind: "skipped",
                    member: setting.member,
                    reason: "not_due",
                };
            }

            const dedupeKey = `morning-briefing:${setting.email}:${today}`;
            if (
                !forceSend &&
                (await hasRecentNotificationDelivery(supabase, {
                    teamId,
                    dedupeKey,
                    cooldownHours: 24,
                }))
            ) {
                return {
                    kind: "skipped",
                    member: setting.member,
                    reason: "already_sent",
                };
            }

            const { data: webhookRow, error: webhookError } = await supabase
                .from("agent_member_webhooks")
                .select("webhook_url")
                .eq("team_id", teamId)
                .eq("email", setting.email)
                .maybeSingle();
            if (webhookError) throw webhookError;
            if (!webhookRow?.webhook_url) {
                return {
                    kind: "skipped",
                    member: setting.member,
                    reason: "missing_webhook",
                };
            }

            const fresh = await buildFreshSuggestion(
                supabase,
                teamId,
                setting,
                loadTeamCalendarEvents,
            );
            if (!fresh) {
                return {
                    kind: "skipped",
                    member: setting.member,
                    reason: "empty_briefing",
                };
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
                return {
                    kind: "skipped",
                    member: setting.member,
                    reason: "empty_briefing",
                };
            }

            const suggestion = created as AgentSuggestion;

            const { error: staleCleanupError } = await supabase
                .from("agent_suggestions")
                .update({
                    status: "dismissed",
                    reviewed_by: "morning-briefing-cron",
                    reviewed_at: new Date().toISOString(),
                })
                .eq("team_id", teamId)
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
                return {
                    kind: "skipped",
                    member: setting.member,
                    reason: "invalid_payload",
                };
            }

            // 발송 전에 발송 이력 행을 먼저 넣어 선점한다(claim-first).
            // (team_id, dedupe_key) 고유 인덱스(V65) 덕분에 동시에 도는 두 실행 중 하나만 성공한다.
            const deliveryRow = {
                team_id: teamId,
                suggestion_id: suggestion.id,
                agent_type: "notification",
                target_table: suggestion.target_table,
                target_id: suggestion.target_id,
                dedupe_key: dedupeKey,
                channel: "personal_dm",
                recipient_member: setting.member,
                payload: suggestion.payload,
                sent_by: "morning-briefing-cron",
            };
            const { data: claim, error: claimError } = await supabase
                .from("agent_notification_deliveries")
                .insert(deliveryRow)
                .select("id")
                .maybeSingle();
            const alreadyClaimed = claimError?.code === UNIQUE_VIOLATION;
            if (claimError && !alreadyClaimed) throw claimError;
            if (alreadyClaimed && !forceSend) {
                return {
                    kind: "skipped",
                    member: setting.member,
                    reason: "already_sent",
                };
            }

            try {
                await sendGoogleChatMessage({
                    text: suggestion.payload.text,
                    card: suggestion.payload.card,
                    channel: "personal_dm",
                    recipientMember: setting.member,
                    webhookUrl: decryptIntegrationToken(webhookRow.webhook_url),
                });
            } catch (sendError) {
                // 확실히 실패한 경우에만 선점을 풀어 다음 실행에서 다시 보낼 수 있게 한다.
                // 타임아웃(결과 불명)은 중복 발송을 막기 위해 선점을 유지한다.
                if (claim?.id && !(sendError instanceof DeliveryUnknownError)) {
                    const { error: releaseError } = await supabase
                        .from("agent_notification_deliveries")
                        .delete()
                        .eq("id", claim.id);
                    if (releaseError) {
                        console.error(
                            `[morning-briefing:${teamId}] 발송 선점 해제 실패`,
                            releaseError,
                        );
                    }
                }
                throw sendError;
            }

            if (alreadyClaimed) {
                // 강제 재발송: 기존 이력 행을 최신 발송 내용으로 갱신한다.
                const { error: deliveryError } = await supabase
                    .from("agent_notification_deliveries")
                    .update({
                        suggestion_id: suggestion.id,
                        payload: suggestion.payload,
                        sent_at: new Date().toISOString(),
                    })
                    .eq("team_id", teamId)
                    .eq("dedupe_key", dedupeKey);
                if (deliveryError) throw deliveryError;
            }

            const { error: suggestionUpdateError } = await supabase
                .from("agent_suggestions")
                .update({
                    status: "applied",
                    reviewed_by: "morning-briefing-cron",
                    reviewed_at: new Date().toISOString(),
                })
                .eq("team_id", teamId)
                .eq("id", suggestion.id);
            if (suggestionUpdateError) throw suggestionUpdateError;

            return {
                kind: "sent",
                member: setting.member,
                title: suggestion.title,
            };
        } catch (err) {
            console.error(`[morning-briefing-member:${teamId}]`, err);
            return {
                kind: "skipped",
                member: setting.member,
                reason: "delivery_failed",
            };
        }
    };

    return mapWithConcurrency(targets, MEMBER_CONCURRENCY, processTarget);
}

async function handleMorningBriefings(req: NextRequest) {
    if (!isCronAuthorized(req)) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // 시크릿 유출 시에도 대량 재발송을 막는 2차 방어선
    const rate = await consumeSharedRateLimit(
        requestRateLimitKey(req, "cron-morning-briefing"),
        { limit: 10, windowMs: 5 * 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    const supabase = createServiceSupabaseClient();

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

        // 알림 설정이 존재하는 활성 팀 목록을 조회한다.
        const { data: teamRows, error: teamError } = await supabase
            .from("teams")
            .select("id")
            .eq("status", "active");
        if (teamError) throw teamError;
        const activeTeamIds = (teamRows ?? []).map((r) => String(r.id));

        // 팀별 순차 처리 (팀 간 Google API 한도 격리)
        for (const teamId of activeTeamIds) {
            const outcomes = await processTeam(supabase, teamId, forceSend, today);
            for (const outcome of outcomes) {
                if (outcome.kind === "sent") {
                    sent.push({ member: outcome.member, title: outcome.title });
                } else {
                    skipped.push({
                        member: outcome.member,
                        reason: outcome.reason,
                    });
                }
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