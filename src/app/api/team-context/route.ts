import { NextRequest, NextResponse } from "next/server";
import { TEAM_ID } from "@/lib/constants";
import { getServerUser } from "@/lib/serverSupabase";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";
import type {
    TeamContextOption,
    TeamContextResponse,
} from "@/features/team-context/types";

const CURRENT_TEAM_COOKIE = "current_team_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function unauthorized() {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

function setTeamCookie(response: NextResponse, teamId: string) {
    response.cookies.set(CURRENT_TEAM_COOKIE, teamId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
    });
}

async function loadTeamContext(requestedTeamId?: string, strictTeamSelection = false) {
    const { supabase, user } = await getServerUser();
    if (!user?.email) return null;

    const identity = await loadNormalizedIdentity(supabase, user.email);
    if (!identity?.profile || identity.profile.accountStatus !== "active") {
        return { error: "No active profile", status: 403 } as const;
    }

    const memberships = identity.memberships.filter(
        (membership) => membership.status === "active",
    );
    if (memberships.length === 0) {
        return { error: "No active team membership", status: 403 } as const;
    }

    const membershipByTeam = new Map(
        memberships.map((membership) => [membership.teamId, membership]),
    );

    const { data: teamRows, error: teamsError } = await supabase
        .from("teams")
        .select("id, name, status")
        .in(
            "id",
            memberships.map((membership) => membership.teamId),
        );
    if (teamsError) throw teamsError;

    const activeTeamNames = new Map(
        (teamRows ?? [])
            .filter((team) => team.status === "active")
            .map((team) => [String(team.id), String(team.name)]),
    );
    const teams: TeamContextOption[] = memberships
        .filter((membership) => activeTeamNames.has(membership.teamId))
        .map((membership) => ({
            id: membership.teamId,
            name: activeTeamNames.get(membership.teamId) ?? membership.teamId,
            role: membership.role,
            isDefault: membership.isDefault,
        }))
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

    if (teams.length === 0) {
        return { error: "No active team", status: 403 } as const;
    }
    if (
        strictTeamSelection &&
        requestedTeamId &&
        !teams.some((team) => team.id === requestedTeamId)
    ) {
        return { error: "Not a member of this team", status: 403 } as const;
    }

    const storedTeamId = requestedTeamId;
    const selectedTeam =
        teams.find((team) => team.id === storedTeamId) ??
        teams.find((team) => team.isDefault) ??
        teams.find((team) => team.id === TEAM_ID) ??
        teams[0];
    const membership = membershipByTeam.get(selectedTeam.id);

    const { data: playerRows, error: playersError } = await supabase
        .from("players")
        .select("id, name, email, avatar_url")
        .eq("team_id", selectedTeam.id)
        .eq("status", "active")
        .order("id");
    if (playersError) throw playersError;

    const player = (playerRows ?? []).find(
        (row) => row.email?.toLowerCase() === user.email?.toLowerCase(),
    );

    const body: TeamContextResponse = {
        teamId: selectedTeam.id,
        teams,
        members: (playerRows ?? []).map((row) => String(row.name)),
        memberOptions: (playerRows ?? []).map((row) => ({
            id: Number(row.id),
            name: String(row.name),
        })),
        member: player?.name || identity.profile.displayName,
        playerId:
            typeof player?.id === "number"
                ? player.id
                : (membership?.legacyPlayerId ?? null),
        avatarUrl: player?.avatar_url || identity.profile.avatarUrl,
        role: membership?.role ?? "viewer",
    };
    return { body } as const;
}

export async function GET(request: NextRequest) {
    try {
        const result = await loadTeamContext(request.cookies.get(CURRENT_TEAM_COOKIE)?.value);
        if (!result) return unauthorized();
        if ("error" in result) {
            return NextResponse.json(
                { message: result.error },
                { status: result.status },
            );
        }

        const response = NextResponse.json(result.body);
        setTeamCookie(response, result.body.teamId);
        return response;
    } catch (error) {
        console.error("[team-context] GET failed", error);
        return NextResponse.json(
            { message: "Failed to load team context" },
            { status: 500 },
        );
    }
}

export async function PUT(request: NextRequest) {
    try {
        const payload = (await request.json()) as { teamId?: unknown };
        const teamId =
            typeof payload.teamId === "string" ? payload.teamId.trim() : "";
        if (!teamId) {
            return NextResponse.json(
                { message: "teamId is required" },
                { status: 400 },
            );
        }

        const result = await loadTeamContext(teamId, true);
        if (!result) return unauthorized();
        if ("error" in result) {
            return NextResponse.json(
                { message: result.error },
                { status: result.status },
            );
        }

        const response = NextResponse.json(result.body);
        setTeamCookie(response, result.body.teamId);
        return response;
    } catch (error) {
        console.error("[team-context] PUT failed", error);
        return NextResponse.json(
            { message: "Failed to switch team" },
            { status: 500 },
        );
    }
}
