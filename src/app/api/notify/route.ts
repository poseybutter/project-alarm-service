import { NextRequest, NextResponse } from "next/server";
import { MEMBERS } from "@/lib/constants";
import { sendGoogleChatMessage } from "@/lib/server/googleChat";
import { getServerUser } from "@/lib/serverSupabase";

const MAX_LEVEL_NAME_LENGTH = 100;

type NotifyBody = {
    type?: unknown;
    memberName?: unknown;
    levelName?: unknown;
};

function buildLevelUpText(body: NotifyBody) {
    const memberName =
        typeof body.memberName === "string" ? body.memberName.trim() : "";
    const levelName =
        typeof body.levelName === "string" ? body.levelName.trim() : "";

    if (!memberName || !MEMBERS.includes(memberName)) return null;
    if (!levelName || levelName.length > MAX_LEVEL_NAME_LENGTH) return null;

    return `레벨업! *${memberName}*님이 새 레벨을 달성했습니다.\n*${levelName}*`;
}

export async function POST(request: NextRequest) {
    const { user } = await getServerUser();
    if (!user?.email) {
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

    const text = buildLevelUpText(body);
    if (!text) {
        return NextResponse.json(
            { error: "invalid_level_up_payload" },
            { status: 400 },
        );
    }

    try {
        await sendGoogleChatMessage({ text, channel: "team_room" });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "failed" }, { status: 500 });
    }
}
