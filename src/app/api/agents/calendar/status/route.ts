import { NextResponse } from "next/server";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { decryptIntegrationToken } from "@/infrastructure/security/tokenEncryption";

export async function GET() {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const serviceSupabase = createServiceSupabaseClient();
        const { data, error } = await serviceSupabase
            .from("agent_calendar_connections")
            .select("member, email, google_email, connected_at, updated_at")
            .eq("team_id", teamId)
            .eq("email", user.email)
            .maybeSingle();

        if (error) throw error;
        return NextResponse.json({
            connected: Boolean(data),
            connection: data ?? null,
        });
    } catch (error) {
        return internalErrorResponse(
            "google-calendar-status",
            error,
            "캘린더 연결 상태를 불러오지 못했습니다.",
        );
    }
}

export async function DELETE() {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceSupabaseClient();
    try {
        const { data: connection, error: connectionError } = await service
            .from("agent_calendar_connections")
            .select("access_token, refresh_token")
            .eq("team_id", teamId)
            .eq("email", user.email)
            .maybeSingle();
        if (connectionError) throw connectionError;
        if (!connection) return NextResponse.json({ disconnected: true });

        const { data: teamSetting, error: settingError } = await service
            .from("agent_team_calendar_settings")
            .select("connection_email")
            .eq("team_id", teamId)
            .maybeSingle();
        if (settingError) throw settingError;
        if (teamSetting?.connection_email === user.email) {
            return NextResponse.json(
                {
                    message:
                        "팀 캘린더에서 사용 중인 연결입니다. 팀 캘린더 설정을 먼저 변경해주세요.",
                },
                { status: 409 },
            );
        }

        const token = decryptIntegrationToken(
            connection.refresh_token || connection.access_token,
        );
        if (token) {
            try {
                const revokeResponse = await fetch(
                    "https://oauth2.googleapis.com/revoke",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                        body: new URLSearchParams({ token }),
                        cache: "no-store",
                    },
                );
                if (!revokeResponse.ok) {
                    console.warn(
                        "[google-calendar-disconnect] token revoke failed",
                    );
                }
            } catch (error) {
                console.warn(
                    "[google-calendar-disconnect] token revoke request failed",
                    error,
                );
            }
        }

        const { error: eventsError } = await service
            .from("agent_calendar_events")
            .delete()
            .eq("team_id", teamId)
            .eq("email", user.email);
        if (eventsError) throw eventsError;

        const { error: deleteError } = await service
            .from("agent_calendar_connections")
            .delete()
            .eq("team_id", teamId)
            .eq("email", user.email);
        if (deleteError) throw deleteError;

        return NextResponse.json({ disconnected: true });
    } catch (error) {
        return internalErrorResponse(
            "google-calendar-disconnect",
            error,
            "캘린더 연결을 해제하지 못했습니다.",
        );
    }
}
