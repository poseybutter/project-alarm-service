import { NextResponse, type NextRequest } from "next/server";
import {
    AdminApiError,
    requireAdminSession,
} from "@/features/admin/server/adminRepository";
import { adminErrorResponse } from "@/features/admin/server/http";
import {
    GOOGLE_CALENDAR_WRITE_SCOPE,
    hasGoogleCalendarScope,
} from "@/infrastructure/google-calendar";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import {
    resolveTeamMember,
    listActiveTeamMembers,
} from "@/features/identity/server/identityRepository";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_MORNING_SEND_TIME = "08:30";

export async function GET() {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const service = createServiceSupabaseClient();
        const member = await resolveTeamMember(service, user.email, teamId);
        if (!member) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        const { data, error } = await service
            .from("agent_member_notification_settings")
            .select("morning_send_time, morning_enabled")
            .eq("team_id", teamId)
            .eq("email", user.email)
            .maybeSingle();
        if (error) throw error;

        let teamCalendar = null;
        let memberCalendars: Array<{
            member: string;
            calendar_id: string;
            updated_at: string;
        }> = [];
        if (role === "admin") {
            await requireAdminSession(teamId, "integrations.read");
            const [teamResult, memberResult] = await Promise.all([
                service
                    .from("agent_team_calendar_settings")
                    .select("calendar_id, connection_email, updated_at")
                    .eq("team_id", teamId)
                    .maybeSingle(),
                service
                    .from("agent_member_calendar_settings")
                    .select("member, calendar_id, updated_at")
                    .eq("team_id", teamId)
                    .order("member", { ascending: true }),
            ]);
            if (teamResult.error) throw teamResult.error;
            if (memberResult.error) throw memberResult.error;
            teamCalendar = teamResult.data;
            memberCalendars = memberResult.data ?? [];
        }

        return NextResponse.json({
            settings: data ?? {
                morning_send_time: `${DEFAULT_MORNING_SEND_TIME}:00`,
                morning_enabled: true,
            },
            teamCalendar,
            memberCalendars,
        });
    } catch (error) {
        if (error instanceof AdminApiError) return adminErrorResponse(error);
        return internalErrorResponse(
            "agent-settings-get",
            error,
            "알림 설정을 불러오지 못했습니다.",
        );
    }
}

export async function PUT(req: NextRequest) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body: {
        morningSendTime?: string;
        morningEnabled?: boolean;
        teamCalendarId?: string;
        memberCalendarIds?: Record<string, string>;
    };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const morningSendTime = body.morningSendTime ?? DEFAULT_MORNING_SEND_TIME;
    if (!TIME_PATTERN.test(morningSendTime)) {
        return NextResponse.json(
            { message: "morningSendTime must be HH:mm" },
            { status: 400 },
        );
    }
    if (
        body.morningEnabled !== undefined &&
        typeof body.morningEnabled !== "boolean"
    ) {
        return NextResponse.json(
            { message: "morningEnabled must be boolean" },
            { status: 400 },
        );
    }
    if (
        body.teamCalendarId !== undefined &&
        typeof body.teamCalendarId !== "string"
    ) {
        return NextResponse.json(
            { message: "teamCalendarId must be string" },
            { status: 400 },
        );
    }
    if (
        body.memberCalendarIds !== undefined &&
        (!body.memberCalendarIds ||
            typeof body.memberCalendarIds !== "object" ||
            Array.isArray(body.memberCalendarIds) ||
            Object.values(body.memberCalendarIds).some(
                (value) => typeof value !== "string",
            ))
    ) {
        return NextResponse.json(
            { message: "memberCalendarIds must be an object of strings" },
            { status: 400 },
        );
    }

    try {
        const service = createServiceSupabaseClient();
        const member = await resolveTeamMember(service, user.email, teamId);
        if (!member) {
            return NextResponse.json(
                { message: "Player not found" },
                { status: 404 },
            );
        }

        // 권한 확인은 어떤 쓰기보다 먼저 한다. 그래야 권한 없는 요청이
        // 개인 설정만 저장된 채 403 으로 끝나는 부분 반영이 생기지 않는다.
        const teamCalendarId = body.teamCalendarId?.trim();
        if (teamCalendarId !== undefined || body.memberCalendarIds !== undefined) {
            await requireAdminSession(teamId, "integrations.manage");
        }

        // 팀 캘린더 ID 가 바뀔 때만 연결 계정을 저장자 계정으로 바꾼다.
        // 그 계정에 캘린더 연결(쓰기 권한 포함)이 없으면 팀 동기화가 깨지므로 미리 막는다.
        let teamCalendarChanged = false;
        if (teamCalendarId) {
            const { data: currentTeamCalendar, error: currentError } =
                await service
                    .from("agent_team_calendar_settings")
                    .select("calendar_id")
                    .eq("team_id", teamId)
                    .maybeSingle();
            if (currentError) throw currentError;
            teamCalendarChanged =
                currentTeamCalendar?.calendar_id !== teamCalendarId;

            if (teamCalendarChanged) {
                const { data: adminConnection, error: connectionError } =
                    await service
                        .from("agent_calendar_connections")
                        .select("scope")
                        .eq("team_id", teamId)
                        .eq("email", user.email)
                        .maybeSingle();
                if (connectionError) throw connectionError;
                if (!adminConnection) {
                    return NextResponse.json(
                        {
                            message:
                                "팀 캘린더를 바꾸려면 먼저 본인 Google Calendar를 연결해 주세요.",
                        },
                        { status: 400 },
                    );
                }
                // scope 가 기록되지 않은 예전 연결은 검사할 수 없으므로 통과시킨다.
                if (
                    adminConnection.scope &&
                    !hasGoogleCalendarScope(
                        adminConnection.scope,
                        GOOGLE_CALENDAR_WRITE_SCOPE,
                    )
                ) {
                    return NextResponse.json(
                        {
                            message:
                                "연결된 Google Calendar에 일정 쓰기 권한이 없습니다. 캘린더를 다시 연결해 주세요.",
                        },
                        { status: 400 },
                    );
                }
            }
        }

        let memberCalendarEntries: Array<{ member: string; calendarId: string }> =
            [];
        if (body.memberCalendarIds !== undefined) {
            const activeMembers = await listActiveTeamMembers(service, teamId);
            const allowedMembers = new Set(
                activeMembers.map((m) => m.name),
            );

            memberCalendarEntries = Object.entries(body.memberCalendarIds).map(
                ([member, calendarId]) => ({
                    member: member.trim(),
                    calendarId: calendarId.trim(),
                }),
            );
            if (
                memberCalendarEntries.some(
                    (entry) => !allowedMembers.has(entry.member),
                )
            ) {
                return NextResponse.json(
                    { message: "팀에 속하지 않은 구성원이 포함되어 있습니다." },
                    { status: 400 },
                );
            }
        }

        const { data, error } = await service
            .from("agent_member_notification_settings")
            .upsert(
                {
                    team_id: teamId,
                    member: member.name,
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

        let teamCalendar = null;
        if (teamCalendarId !== undefined) {
            if (teamCalendarId.length === 0) {
                const { error: deleteError } = await service
                    .from("agent_team_calendar_settings")
                    .delete()
                    .eq("team_id", teamId);
                if (deleteError) throw deleteError;
            } else if (teamCalendarChanged) {
                const { data: savedTeamCalendar, error: teamCalendarError } =
                    await service
                        .from("agent_team_calendar_settings")
                        .upsert(
                            {
                                team_id: teamId,
                                calendar_id: teamCalendarId,
                                connection_email: user.email,
                                updated_at: new Date().toISOString(),
                            },
                            { onConflict: "team_id" },
                        )
                        .select("calendar_id, connection_email, updated_at")
                        .maybeSingle();
                if (teamCalendarError) throw teamCalendarError;
                teamCalendar = savedTeamCalendar;
            } else {
                // 같은 캘린더면 연결 계정을 바꾸지 않고 현재 설정을 그대로 돌려준다.
                const { data: currentTeamCalendar, error: teamCalendarError } =
                    await service
                        .from("agent_team_calendar_settings")
                        .select("calendar_id, connection_email, updated_at")
                        .eq("team_id", teamId)
                        .maybeSingle();
                if (teamCalendarError) throw teamCalendarError;
                teamCalendar = currentTeamCalendar;
            }
        }

        let memberCalendars = null;
        if (body.memberCalendarIds !== undefined) {
            const entries = memberCalendarEntries;
            const emptyMembers = entries
                .filter((entry) => entry.calendarId.length === 0)
                .map((entry) => entry.member);
            if (emptyMembers.length > 0) {
                const { error: deleteError } = await service
                    .from("agent_member_calendar_settings")
                    .delete()
                    .eq("team_id", teamId)
                    .in("member", emptyMembers);
                if (deleteError) throw deleteError;
            }

            const rows = entries
                .filter((entry) => entry.calendarId.length > 0)
                .map((entry) => ({
                    team_id: teamId,
                    member: entry.member,
                    calendar_id: entry.calendarId,
                    updated_at: new Date().toISOString(),
                }));
            if (rows.length > 0) {
                const { error: upsertError } = await service
                    .from("agent_member_calendar_settings")
                    .upsert(rows, { onConflict: "team_id,member" });
                if (upsertError) throw upsertError;
            }

            const { data: savedMemberCalendars, error: memberCalendarError } =
                await service
                    .from("agent_member_calendar_settings")
                    .select("member, calendar_id, updated_at")
                    .eq("team_id", teamId)
                    .order("member", { ascending: true });
            if (memberCalendarError) throw memberCalendarError;
            memberCalendars = savedMemberCalendars ?? [];
        }

        return NextResponse.json({ settings: data, teamCalendar, memberCalendars });
    } catch (error) {
        // requireAdminSession 의 권한 오류(403 등)는 500 으로 감추지 않는다.
        if (error instanceof AdminApiError) return adminErrorResponse(error);
        return internalErrorResponse(
            "agent-settings-put",
            error,
            "알림 설정을 저장하지 못했습니다.",
        );
    }
}
