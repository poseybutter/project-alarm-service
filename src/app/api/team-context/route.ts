import { NextRequest, NextResponse } from "next/server";
import { TEAM_ID } from "@/shared/constants";
import { getServerUser } from "@/infrastructure/supabase/server";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";
import { getMemberName } from "@/infrastructure/supabase/auth";
import type {
    ModuleKey,
    TeamContextOption,
    TeamContextResponse,
    TeamMemberOption,
} from "@/features/team-context/types";
import { ALL_MODULES } from "@/features/team-context/types";

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

    const [playerResult, modulesResult] = await Promise.all([
        supabase
            .from("players")
            .select("id, name, email, avatar_url")
            .eq("team_id", selectedTeam.id)
            .eq("status", "active")
            .order("id"),
        supabase
            .from("team_modules")
            .select("module, enabled")
            .eq("team_id", selectedTeam.id),
    ]);

    if (playerResult.error) throw playerResult.error;

    const playerRows = playerResult.data ?? [];
    const player = playerRows.find(
        (row) => row.email?.toLowerCase() === user.email?.toLowerCase(),
    );

    // team_modules 미적용 환경(테이블 없음)에서는 전체 모듈 활성화로 폴백
    const moduleRows = modulesResult.data ?? [];
    const modules: ModuleKey[] =
        modulesResult.error || moduleRows.length === 0
            ? ALL_MODULES
            : moduleRows
                  .filter((row) => row.enabled)
                  .map((row) => row.module as ModuleKey);

    // players 행이 없는 팀(admin에서 생성된 신규 스키마 팀)은
    // team_memberships + profiles로 members/memberOptions를 구성한다.
    let memberNames: string[] = playerRows.map((row) => String(row.name));
    let memberOptions: TeamMemberOption[] = playerRows.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
    }));

    if (playerRows.length === 0) {
        const { data: tmRows } = await supabase
            .from("team_memberships")
            .select("legacy_player_id, profiles!inner(display_name)")
            .eq("team_id", selectedTeam.id)
            .eq("status", "active");
        if (tmRows && tmRows.length > 0) {
            memberNames = tmRows.map((r) => {
                const profile = r.profiles as unknown as { display_name: string };
                return String(profile.display_name ?? "");
            });
            memberOptions = tmRows.map((r) => {
                const profile = r.profiles as unknown as { display_name: string };
                return {
                    id: typeof r.legacy_player_id === "number" ? r.legacy_player_id : null,
                    name: String(profile.display_name ?? ""),
                };
            });
        }
    }

    const body: TeamContextResponse = {
        teamId: selectedTeam.id,
        teams,
        members: memberNames,
        memberOptions,
        member:
            player?.name ||
            // players 행 없는 팀: 환경변수 이름 → 프로필 displayName 순으로 폴백
            getMemberName(user.email ?? "") ||
            identity.profile.displayName,
        playerId:
            typeof player?.id === "number"
                ? player.id
                : (membership?.legacyPlayerId ?? null),
        avatarUrl: player?.avatar_url || identity.profile.avatarUrl,
        role: membership?.role ?? "viewer",
        modules,
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
