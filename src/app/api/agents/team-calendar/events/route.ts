import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import {
    createTeamCalendarEvent,
    getTeamCalendarAccessToken,
    syncTodayTeamCalendarEvents,
    TeamCalendarSyncError,
    type GoogleCalendarConnection,
    type TeamCalendarEventInput,
} from "@/infrastructure/google-calendar";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { hasAdminPermission } from "@/features/admin/server/adminRepository";
import {
    consumeSharedRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/shared/server/rateLimit";
import { listActiveTeamMembers } from "@/features/identity/server/identityRepository";

const VALID_EVENT_TYPES = new Set([
    "meeting",
    "leave",
    "annual_leave",
    "offset",
    "other",
]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
/** 클라이언트 멱등 키: 재시도마다 같은 값을 보내면 같은 일정 하나만 만들어진다. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Google 이벤트 ID 는 base32hex(a-v, 0-9) 5~1024자만 허용한다.
 * 팀 ID 와 함께 해시해 팀 간 충돌 없이 안전한 ID 로 바꾼다(hex 는 base32hex 의 부분집합).
 */
function googleEventIdFromKey(teamId: string, key: string) {
    return `t${createHash("sha256").update(`${teamId}:${key}`).digest("hex").slice(0, 40)}`;
}

type TeamCalendarEventBody = Partial<
    Omit<TeamCalendarEventInput, "attendeeMembers">
> & {
    attendeeMembers?: unknown;
    idempotencyKey?: unknown;
};

export async function POST(req: NextRequest) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // 일정 생성마다 Google API 호출 + 전체 재동기화가 돌므로 남용을 막는다.
    const rate = await consumeSharedRateLimit(
        requestRateLimitKey(req, "team-calendar-events", user.email),
        { limit: 20, windowMs: 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    let body: TeamCalendarEventBody;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    if (typeof body.eventType !== "string" || !VALID_EVENT_TYPES.has(body.eventType)) {
        return NextResponse.json({ message: "일정 유형이 올바르지 않습니다" }, { status: 400 });
    }
    if (body.title !== undefined && typeof body.title !== "string") {
        return NextResponse.json({ message: "일정 제목이 올바르지 않습니다" }, { status: 400 });
    }
    if (typeof body.date !== "string" || !DATE_PATTERN.test(body.date)) {
        return NextResponse.json({ message: "일정 날짜를 선택해주세요" }, { status: 400 });
    }
    if (
        body.endDate != null &&
        (typeof body.endDate !== "string" ||
            (body.endDate && !DATE_PATTERN.test(body.endDate)))
    ) {
        return NextResponse.json({ message: "종료일이 올바르지 않습니다" }, { status: 400 });
    }
    if (body.endDate && body.endDate < body.date) {
        return NextResponse.json(
            { message: "종료일은 시작일 이후여야 합니다" },
            { status: 400 },
        );
    }
    // 종일 일정(연차)을 뺀 나머지는 시간 일정이라 시작 시간이 필수다.
    // 검증하지 않으면 캘린더 생성 단계에서 예외가 나 500 이 된다.
    const isTimedEvent = body.eventType !== "annual_leave";
    if (
        isTimedEvent &&
        (typeof body.startTime !== "string" || !TIME_PATTERN.test(body.startTime))
    ) {
        return NextResponse.json(
            {
                message:
                    body.eventType === "meeting"
                        ? "회의 시작 시간을 입력해주세요"
                        : "시작 시간을 입력해주세요",
            },
            { status: 400 },
        );
    }
    if (
        isTimedEvent &&
        body.endTime != null &&
        body.endTime !== "" &&
        (typeof body.endTime !== "string" || !TIME_PATTERN.test(body.endTime))
    ) {
        return NextResponse.json({ message: "종료 시간이 올바르지 않습니다" }, { status: 400 });
    }
    // 종료일이 시작일보다 뒤면 종료 시간이 시작 시간보다 빨라도 된다(예: 22:00 ~ 다음 날 02:00).
    const endsOnLaterDay = Boolean(body.endDate && body.endDate > body.date);
    if (
        isTimedEvent &&
        !endsOnLaterDay &&
        body.endTime &&
        body.startTime &&
        body.endTime <= body.startTime
    ) {
        return NextResponse.json(
            { message: "종료 시간은 시작 시간보다 늦어야 합니다" },
            { status: 400 },
        );
    }
    if (
        body.attendeeMembers !== undefined &&
        (!Array.isArray(body.attendeeMembers) ||
            body.attendeeMembers.some(
                (name) => typeof name !== "string" || !name.trim(),
            ))
    ) {
        return NextResponse.json({ message: "참석자 목록이 올바르지 않습니다" }, { status: 400 });
    }
    const attendeeMembers = [
        ...new Set(
            ((body.attendeeMembers ?? []) as string[]).map((name) => name.trim()),
        ),
    ];
    if (
        body.targetMember != null &&
        typeof body.targetMember !== "string"
    ) {
        return NextResponse.json({ message: "대상자가 올바르지 않습니다" }, { status: 400 });
    }
    const rawIdempotencyKey =
        req.headers.get("idempotency-key") ?? body.idempotencyKey;
    if (
        rawIdempotencyKey != null &&
        (typeof rawIdempotencyKey !== "string" ||
            !IDEMPOTENCY_KEY_PATTERN.test(rawIdempotencyKey))
    ) {
        return NextResponse.json({ message: "멱등 키가 올바르지 않습니다" }, { status: 400 });
    }
    if (
        ["leave", "annual_leave", "offset"].includes(body.eventType) &&
        !body.targetMember
    ) {
        return NextResponse.json({ message: "대상자를 선택해주세요" }, { status: 400 });
    }

    const input: TeamCalendarEventInput = {
        eventType: body.eventType as TeamCalendarEventInput["eventType"],
        title: body.title ?? "",
        date: body.date,
        endDate: body.endDate || null,
        startTime: body.startTime || null,
        endTime: body.endTime || null,
        meetingRoom:
            typeof body.meetingRoom === "string" ? body.meetingRoom : null,
        targetMember: body.targetMember || null,
        attendeeMembers,
    };

    const supabase = createServiceSupabaseClient();

    try {
        const teamMembers =
            input.targetMember || attendeeMembers.length > 0
                ? await listActiveTeamMembers(supabase, teamId)
                : [];
        if (attendeeMembers.length > 0) {
            const memberNames = new Set(teamMembers.map((m) => m.name));
            if (attendeeMembers.some((name) => !memberNames.has(name))) {
                return NextResponse.json(
                    { message: "참석자는 현재 팀의 활성 구성원이어야 합니다" },
                    { status: 400 },
                );
            }
        }
        if (input.targetMember) {
            const target = teamMembers.find((m) => m.name === input.targetMember);
            if (!target) {
                return NextResponse.json({ message: "현재 팀의 활성 구성원을 선택해주세요" }, { status: 400 });
            }
            // 이름이 아닌 email로 본인 확인 (동명이인 우회 방지)
            if (
                target.email.toLowerCase() !== user.email!.toLowerCase() &&
                !(await hasAdminPermission(teamId, "integrations.manage"))
            ) {
                return NextResponse.json({ message: "본인 일정만 등록할 수 있습니다" }, { status: 403 });
            }
        }
        const { data: setting, error: settingError } = await supabase
            .from("agent_team_calendar_settings")
            .select("calendar_id, connection_email")
            .eq("team_id", teamId)
            .maybeSingle();
        if (settingError) throw settingError;
        if (!setting?.calendar_id || !setting.connection_email) {
            return NextResponse.json(
                { message: "팀 캘린더 ID가 설정되어 있지 않습니다" },
                { status: 400 },
            );
        }

        const targetCalendarId = setting.calendar_id as string;

        const { data: connection, error: connectionError } = await supabase
            .from("agent_calendar_connections")
            .select("member, email, access_token, refresh_token, expires_at")
            .eq("team_id", teamId)
            .eq("email", setting.connection_email)
            .maybeSingle();
        if (connectionError) throw connectionError;
        if (!connection) {
            return NextResponse.json(
                { message: "팀 캘린더 연결 계정을 찾을 수 없습니다" },
                { status: 400 },
            );
        }

        const accessToken = await getTeamCalendarAccessToken(
            supabase,
            teamId,
            connection as GoogleCalendarConnection,
        );
        const event = await createTeamCalendarEvent({
            accessToken,
            calendarId: targetCalendarId,
            input,
            idempotencyKey: rawIdempotencyKey
                ? googleEventIdFromKey(teamId, rawIdempotencyKey)
                : undefined,
        });

        // 일정은 이미 만들어졌으므로, 브리핑용 동기화 실패로 요청 전체를 실패시키지 않는다.
        await syncTodayTeamCalendarEvents(supabase, { teamId }).catch((err) =>
            console.error("[team-calendar-event-create:sync]", err),
        );

        return NextResponse.json({
            event: {
                id: event.id,
                title: event.summary,
                htmlLink: event.htmlLink ?? null,
            },
        });
    } catch (error) {
        if (error instanceof TeamCalendarSyncError) {
            return NextResponse.json({ message: error.message }, { status: 409 });
        }
        return internalErrorResponse(
            "team-calendar-event-create",
            error,
            "팀 일정 등록에 실패했습니다.",
        );
    }
}
