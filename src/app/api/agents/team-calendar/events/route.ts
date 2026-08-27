import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import {
    createTeamCalendarEvent,
    getTeamCalendarAccessToken,
    syncTodayTeamCalendarEvents,
    type GoogleCalendarConnection,
    type TeamCalendarEventInput,
} from "@/infrastructure/google-calendar";
import { internalErrorResponse } from "@/shared/server/apiResponse";

const VALID_EVENT_TYPES = new Set([
    "meeting",
    "leave",
    "annual_leave",
    "offset",
    "other",
]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function POST(req: NextRequest) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body: TeamCalendarEventInput;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    if (!VALID_EVENT_TYPES.has(body.eventType)) {
        return NextResponse.json({ message: "일정 유형이 올바르지 않습니다" }, { status: 400 });
    }
    if (!body.date || !DATE_PATTERN.test(body.date)) {
        return NextResponse.json({ message: "일정 날짜를 선택해주세요" }, { status: 400 });
    }
    if (body.endDate && !DATE_PATTERN.test(body.endDate)) {
        return NextResponse.json({ message: "종료일이 올바르지 않습니다" }, { status: 400 });
    }
    if (body.endDate && body.endDate < body.date) {
        return NextResponse.json(
            { message: "종료일은 시작일 이후여야 합니다" },
            { status: 400 },
        );
    }
    if (
        body.eventType === "meeting" &&
        (!body.startTime || !TIME_PATTERN.test(body.startTime))
    ) {
        return NextResponse.json({ message: "회의 시작 시간을 입력해주세요" }, { status: 400 });
    }
    if (
        body.eventType === "meeting" &&
        body.endTime &&
        !TIME_PATTERN.test(body.endTime)
    ) {
        return NextResponse.json({ message: "회의 종료 시간이 올바르지 않습니다" }, { status: 400 });
    }
    if (
        body.eventType === "meeting" &&
        body.endTime &&
        body.startTime &&
        body.endTime <= body.startTime
    ) {
        return NextResponse.json(
            { message: "회의 종료 시간은 시작 시간보다 늦어야 합니다" },
            { status: 400 },
        );
    }
    if (
        ["leave", "annual_leave", "offset"].includes(body.eventType) &&
        !body.targetMember
    ) {
        return NextResponse.json({ message: "대상자를 선택해주세요" }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();

    try {
        if (body.targetMember) {
            if (role !== "admin") {
                const { data: actor } = await supabase
                    .from("players")
                    .select("name")
                    .eq("team_id", teamId)
                    .eq("email", user.email)
                    .eq("status", "active")
                    .maybeSingle();
                if (!actor?.name || actor.name !== body.targetMember) {
                    return NextResponse.json({ message: "본인 일정만 등록할 수 있습니다" }, { status: 403 });
                }
            }
            const { data: target } = await supabase
                .from("players")
                .select("id")
                .eq("team_id", teamId)
                .eq("name", body.targetMember)
                .eq("status", "active")
                .maybeSingle();
            if (!target) {
                return NextResponse.json({ message: "현재 팀의 활성 구성원을 선택해주세요" }, { status: 400 });
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
            input: body,
        });

        await syncTodayTeamCalendarEvents(supabase, { teamId });

        return NextResponse.json({
            event: {
                id: event.id,
                title: event.summary,
                htmlLink: event.htmlLink ?? null,
            },
        });
    } catch (error) {
        return internalErrorResponse(
            "team-calendar-event-create",
            error,
            "팀 일정 등록에 실패했습니다.",
        );
    }
}
