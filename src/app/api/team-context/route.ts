import { NextRequest, NextResponse } from "next/server";
import { TEAM_ID } from "@/shared/constants";
import {
    createServiceSupabaseClient,
    getServerUser,
} from "@/infrastructure/supabase/server";
import {
    loadNormalizedIdentity,
    listActiveTeamMembers,
} from "@/features/identity/server/identityRepository";
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

    // RLS 제약 회피: 인증된 클라이언트는 자신의 row만 볼 수 있으므로
    // 팀 전체 멤버 목록은 service client로 조회
    const serviceClient = createServiceSupabaseClient();
    const [teamMembers, modulesResult] = await Promise.all([
        listActiveTeamMembers(serviceClient, selectedTeam.id),
        supabase
            .from("team_modules")
            .select("module, enabled")
            .eq("team_id", selectedTeam.id),
    ]);

    const currentMember = teamMembers.find(
        (m) => m.email.toLowerCase() === user.email?.toLowerCase(),
    );

    // team_modules 미적용 환경(테이블 없음)에서는 전체 모듈 활성화로 폴백
    const moduleRows = modulesResult.data ?? [];
    const modules: ModuleKey[] =
        modulesResult.error || moduleRows.length === 0
            ? ALL_MODULES
            : moduleRows
                  .filter((row) => row.enabled)
                  .map((row) => row.module as ModuleKey);

    const memberNames: string[] = teamMembers.map((m) => m.name);
    // legacyPlayerId가 null인 멤버는 downstream에서 numeric id를 전제하므로 제외
    const memberOptions: TeamMemberOption[] = teamMembers
        .filter((m) => m.legacyPlayerId !== null)
        .map((m) => ({
            id: m.legacyPlayerId,
            name: m.name,
        }));

    // avatar: players.avatar_url이 쓰기 대상이므로 직접 조회하여 우선 적용
    let avatarUrl = identity.profile.avatarUrl;
    const currentPlayerId =
        currentMember?.legacyPlayerId ?? membership?.legacyPlayerId ?? null;
    if (currentPlayerId) {
        const { data: playerRow } = await serviceClient
            .from("players")
            .select("avatar_url")
            .eq("id", currentPlayerId)
            .maybeSingle();
        if (playerRow?.avatar_url) avatarUrl = String(playerRow.avatar_url);
    }

    const body: TeamContextResponse = {
        teamId: selectedTeam.id,
        teams,
        members: memberNames,
        memberOptions,
        member: currentMember?.name || identity.profile.displayName,
        playerId: currentPlayerId,
        avatarUrl,
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
