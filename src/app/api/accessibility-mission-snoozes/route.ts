import { NextResponse, type NextRequest } from "next/server";
import { TEAM_ID } from "@/lib/constants";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/lib/serverSupabase";

type SnoozeBody = {
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
    accessibilityId: number,
) {
    const { data: target, error: targetError } = await serviceSupabase
        .from("accessibility")
        .select("id, team_id, member")
        .eq("team_id", TEAM_ID)
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
        .eq("team_id", TEAM_ID)
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
        .eq("team_id", TEAM_ID)
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
    const { user, role } = await getServerUserRole(TEAM_ID);
    if (!user?.email) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await readBody(req);
    if (!body) {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
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
            team_id: TEAM_ID,
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
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to save snooze";
        return NextResponse.json({ message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const { user, role } = await getServerUserRole(TEAM_ID);
    if (!user?.email) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await readBody(req);
    if (!body) {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
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
            .eq("team_id", TEAM_ID)
            .eq("email", targetEmail)
            .in("snooze_key", keys);
        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to clear snooze";
        return NextResponse.json({ message }, { status: 500 });
    }
}
