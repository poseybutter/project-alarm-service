import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";

type SnoozeBody = {
    teamId?: string;
    accessibilityId?: number;
    keys?: string[];
    snoozedUntil?: string;
};

function parseKeys(keys?: string[]) {
    return [...new Set((keys ?? []).map((key) => key.trim()).filter(Boolean))];
}

function isValidKeyForTarget(keys: string[], targetId: number) {
    const allowedKeyPrefix = `${targetId}:`;
    const allowedRowKey = `row:${targetId}`;
    return keys.every(
        (key) => key === allowedRowKey || key.startsWith(allowedKeyPrefix),
    );
}

async function getAuthorizedTarget(
    serviceSupabase: ReturnType<typeof createServiceSupabaseClient>,
    userEmail: string,
    role: string | null,
    teamId: string,
    accessibilityId: number,
) {
    const { data: target, error: targetError } = await serviceSupabase
        .from("accessibility")
        .select("id, team_id, member")
        .eq("team_id", teamId)
        .eq("id", accessibilityId)
        .maybeSingle();
    if (targetError) throw targetError;
    if (!target) {
        return {
            error: NextResponse.json(
                { message: "Accessibility item not found" },
                { status: 404 },
            ),
        };
    }

    const { data: actor, error: actorError } = await serviceSupabase
        .from("players")
        .select("name, role")
        .eq("team_id", teamId)
        .eq("email", userEmail)
        .maybeSingle();
    if (actorError) throw actorError;
    const isOwner = actor?.name === target.member;
    const isAdmin = role === "admin" || actor?.role === "admin";
    if (!isOwner && !isAdmin) {
        return {
            error: NextResponse.json({ message: "Forbidden" }, { status: 403 }),
        };
    }

    const { data: targetPlayer, error: playerError } = await serviceSupabase
        .from("players")
        .select("email")
        .eq("team_id", teamId)
        .eq("name", target.member)
        .maybeSingle();
    if (playerError) throw playerError;
    if (!targetPlayer?.email) {
        return {
            error: NextResponse.json(
                { message: "Target member email not found" },
                { status: 404 },
            ),
        };
    }

    return { target, targetEmail: targetPlayer.email };
}

async function readBody(req: NextRequest) {
    try {
        return (await req.json()) as SnoozeBody;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    const body = await readBody(req);
    if (!body) {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    if (!teamId) {
        return NextResponse.json({ message: "teamId is required" }, { status: 400 });
    }
    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const accessibilityId = Number(body.accessibilityId);
    const keys = parseKeys(body.keys);
    const snoozedUntil = body.snoozedUntil
        ? new Date(body.snoozedUntil)
        : null;

    if (!Number.isFinite(accessibilityId) || accessibilityId <= 0) {
        return NextResponse.json(
            { message: "accessibilityId is required" },
            { status: 400 },
        );
    }
    if (keys.length === 0) {
        return NextResponse.json(
            { message: "keys are required" },
            { status: 400 },
        );
    }
    if (!snoozedUntil || Number.isNaN(snoozedUntil.getTime())) {
        return NextResponse.json(
            { message: "snoozedUntil must be a valid date" },
            { status: 400 },
        );
    }

    try {
        const serviceSupabase = createServiceSupabaseClient();
        const authorized = await getAuthorizedTarget(
            serviceSupabase,
            user.email,
            role,
            teamId,
            accessibilityId,
        );
        if (authorized.error) return authorized.error;
        const { target, targetEmail } = authorized;

        if (!isValidKeyForTarget(keys, target.id)) {
            return NextResponse.json(
                { message: "Invalid snooze key" },
                { status: 400 },
            );
        }

        const now = new Date().toISOString();
        const rows = keys.map((key) => ({
            team_id: teamId,
            member: target.member,
            email: targetEmail,
            snooze_key: key,
            snoozed_until: snoozedUntil.toISOString(),
            updated_at: now,
        }));
        const { error: upsertError } = await serviceSupabase
            .from("agent_accessibility_mission_snoozes")
            .upsert(rows, { onConflict: "team_id,email,snooze_key" });
        if (upsertError) throw upsertError;

        return NextResponse.json({ ok: true });
    } catch (error) {
        return internalErrorResponse(
            "accessibility-snooze-save",
            error,
            "다시 알림 설정을 저장하지 못했습니다.",
        );
    }
}

export async function DELETE(req: NextRequest) {
    const body = await readBody(req);
    if (!body) {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    if (!teamId) {
        return NextResponse.json({ message: "teamId is required" }, { status: 400 });
    }
    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const accessibilityId = Number(body.accessibilityId);
    const keys = parseKeys(body.keys);
    if (!Number.isFinite(accessibilityId) || accessibilityId <= 0) {
        return NextResponse.json(
            { message: "accessibilityId is required" },
            { status: 400 },
        );
    }
    if (keys.length === 0) {
        return NextResponse.json(
            { message: "keys are required" },
            { status: 400 },
        );
    }

    try {
        const serviceSupabase = createServiceSupabaseClient();
        const authorized = await getAuthorizedTarget(
            serviceSupabase,
            user.email,
            role,
            teamId,
            accessibilityId,
        );
        if (authorized.error) return authorized.error;
        const { target, targetEmail } = authorized;

        if (!isValidKeyForTarget(keys, target.id)) {
            return NextResponse.json(
                { message: "Invalid snooze key" },
                { status: 400 },
            );
        }

        const { error } = await serviceSupabase
            .from("agent_accessibility_mission_snoozes")
            .delete()
            .eq("team_id", teamId)
            .eq("email", targetEmail)
            .in("snooze_key", keys);
        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (error) {
        return internalErrorResponse(
            "accessibility-snooze-clear",
            error,
            "다시 알림 설정을 해제하지 못했습니다.",
        );
    }
}
