import { NextRequest, NextResponse } from "next/server";
import { LEVELS } from "@/features/gamification/levels";
import { internalErrorResponse } from "@/lib/server/apiResponse";
import { DeliveryUnknownError, sendGoogleChatMessage } from "@/infrastructure/google-chat";
import {
    createServiceSupabaseClient,
    getServerCurrentTeamRole,
} from "@/lib/serverSupabase";

type NotifyBody = {
    type?: unknown;
    memberName?: unknown;
    levelName?: unknown;
};

function safeChatText(value: string) {
    return value.replace(/[\\*_~<>]/g, "").trim();
}

export async function POST(request: NextRequest) {
    const { user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let body: NotifyBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    if (body.type !== "level_up") {
        return NextResponse.json(
            { error: "unsupported_notification_type" },
            { status: 400 },
        );
    }

    const memberName =
        typeof body.memberName === "string" ? body.memberName.trim() : "";
    const levelName =
        typeof body.levelName === "string" ? body.levelName.trim() : "";
    if (!memberName || !levelName) {
        return NextResponse.json(
            { error: "invalid_level_up_payload" },
            { status: 400 },
        );
    }

    const service = createServiceSupabaseClient();
    try {
        const { data: player, error: playerError } = await service
            .from("players")
            .select("id, name, level")
            .eq("team_id", teamId)
            .eq("name", memberName)
            .eq("status", "active")
            .maybeSingle();
        if (playerError) throw playerError;
        if (!player) {
            return NextResponse.json(
                { error: "member_not_found" },
                { status: 404 },
            );
        }

        const expectedLevel = LEVELS.find((item) => item.level === player.level);
        if (!expectedLevel || expectedLevel.name !== levelName) {
            return NextResponse.json(
                { error: "level_state_mismatch" },
                { status: 409 },
            );
        }

        const { data: claimedEvent, error: claimError } = await service
            .from("level_up_notification_events")
            .update({ status: "sending", failure_code: null })
            .eq("team_id", teamId)
            .eq("player_id", player.id)
            .eq("level", player.level)
            .eq("status", "pending")
            .select("id")
            .maybeSingle();
        if (claimError) throw claimError;
        if (!claimedEvent) {
            return NextResponse.json(
                { error: "level_event_not_pending" },
                { status: 409 },
            );
        }

        try {
            await sendGoogleChatMessage({
                text: `레벨업! *${safeChatText(player.name)}*님이 새 레벨을 달성했습니다.\n*${safeChatText(expectedLevel.name)}*`,
                channel: "team_room",
            });
        } catch (error) {
            const isUnknown = error instanceof DeliveryUnknownError;
            const { error: recoverError } = await service
                .from("level_up_notification_events")
                .update({
                    status: isUnknown ? "sending" : "pending",
                    failure_code: isUnknown
                        ? "delivery_unknown"
                        : "delivery_failed",
                })
                .eq("id", claimedEvent.id);
            if (recoverError) throw recoverError;
            throw error;
        }

        const { error: completeError } = await service
            .from("level_up_notification_events")
            .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                failure_code: null,
            })
            .eq("id", claimedEvent.id);
        if (completeError) throw completeError;

        return NextResponse.json({ success: true });
    } catch (error) {
        return internalErrorResponse(
            "level-up-notify",
            error,
            "레벨업 알림을 발송하지 못했습니다.",
        );
    }
}
