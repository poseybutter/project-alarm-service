import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type DatabaseError = { code?: string };

export type NormalizedProfile = {
  id: string;
  authUserId: string | null;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  accountStatus: "active" | "pending" | "suspended" | "rejected";
};

export type NormalizedMembership = {
  id: string;
  profileId: string;
  teamId: string;
  role: "admin" | "member" | "viewer";
  status: "active" | "suspended";
  isDefault: boolean;
  legacyPlayerId: number | null;
};

export type NormalizedIdentity = {
  profile: NormalizedProfile | null;
  memberships: NormalizedMembership[];
};

export function isIdentitySchemaUnavailable(error: unknown) {
  const code = (error as DatabaseError | null)?.code;
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST200" ||
    code === "PGRST205"
  );
}

export type TeamMemberInfo = {
  name: string;
  email: string;
  role: "admin" | "member" | "viewer";
  membershipId: string;
  legacyPlayerId: number | null;
};

/**
 * 특정 팀의 단일 멤버를 email로 조회합니다.
 * V31 미적용 환경에서는 players 테이블로 폴백합니다.
 */
export async function resolveTeamMember(
  client: SupabaseClient,
  email: string,
  teamId: string,
): Promise<TeamMemberInfo | null> {
  const { data: tmRow, error: tmError } = await client
    .from("team_memberships")
    .select(
      "id, role, legacy_player_id, profiles!inner(display_name, email)",
    )
    .eq("team_id", teamId)
    // 의도적 active 필터: 정지된 멤버의 API 접근을 차단 (기존 일부 players 쿼리는 필터 없었으나 정규화)
    .eq("status", "active")
    .eq("profiles.email", email.toLowerCase())
    .maybeSingle();

  if (tmError && isIdentitySchemaUnavailable(tmError)) {
    const { data: player, error: playerError } = await client
      .from("players")
      .select("id, name, email, role")
      .eq("team_id", teamId)
      .ilike("email", email)
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player?.name) return null;
    return {
      name: player.name,
      email: player.email,
      role: player.role === "admin" ? "admin" : "member",
      membershipId: "",
      legacyPlayerId: player.id,
    };
  }
  if (tmError) throw tmError;
  if (!tmRow) return null;

  const profile = tmRow.profiles as unknown as {
    display_name: string;
    email: string;
  };
  const legacyPlayerId =
    typeof tmRow.legacy_player_id === "number"
      ? tmRow.legacy_player_id
      : null;

  // 레거시 호환: agent 테이블의 member 키는 players.name 기준
  let name = profile.display_name;
  if (legacyPlayerId) {
    const { data: playerRow } = await client
      .from("players")
      .select("name")
      .eq("id", legacyPlayerId)
      .maybeSingle();
    if (playerRow?.name) name = playerRow.name;
  }

  return {
    name,
    email: profile.email,
    role: tmRow.role as TeamMemberInfo["role"],
    membershipId: String(tmRow.id),
    legacyPlayerId,
  };
}

/**
 * 특정 팀의 활성 멤버 전체 목록을 조회합니다.
 * V31 미적용 환경에서는 players 테이블로 폴백합니다.
 */
export async function listActiveTeamMembers(
  client: SupabaseClient,
  teamId: string,
): Promise<TeamMemberInfo[]> {
  const { data: tmRows, error: tmError } = await client
    .from("team_memberships")
    .select(
      "id, role, legacy_player_id, profiles!inner(display_name, email)",
    )
    .eq("team_id", teamId)
    // 의도적 active 필터: 정지된 멤버 제외 (기존 일부 players 쿼리는 필터 없었으나 정규화)
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  if (tmError && isIdentitySchemaUnavailable(tmError)) {
    // sort_order 컬럼이 아직 없을 수 있으므로 먼저 시도 후 폴백
    let { data: players, error: playersError } = await client
      .from("players")
      .select("id, name, email, role, sort_order")
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("sort_order", { ascending: true });
    if (playersError && (playersError as { code?: string }).code === "42703") {
      const fb = await client
        .from("players")
        .select("id, name, email, role")
        .eq("team_id", teamId)
        .eq("status", "active")
        .order("id", { ascending: true });
      players = fb.data as typeof players;
      playersError = fb.error;
    }
    if (playersError) throw playersError;
    return (players ?? []).map((p) => ({
      name: p.name,
      email: p.email,
      role: p.role === "admin" ? ("admin" as const) : ("member" as const),
      membershipId: "",
      legacyPlayerId: p.id,
    }));
  }
  if (tmError) throw tmError;

  // 레거시 호환: agent 테이블의 member 키는 players.name 기준
  const legacyIds = (tmRows ?? [])
    .map((r) => r.legacy_player_id)
    .filter((id): id is number => typeof id === "number");
  const nameMap = new Map<number, string>();
  if (legacyIds.length > 0) {
    const { data: playerRows } = await client
      .from("players")
      .select("id, name")
      .in("id", legacyIds);
    for (const p of playerRows ?? []) {
      if (p.name) nameMap.set(Number(p.id), String(p.name));
    }
  }

  return (tmRows ?? []).map((r) => {
    const profile = r.profiles as unknown as {
      display_name: string;
      email: string;
    };
    const legacyPlayerId =
      typeof r.legacy_player_id === "number" ? r.legacy_player_id : null;
    return {
      name:
        (legacyPlayerId ? nameMap.get(legacyPlayerId) : null) ??
        profile.display_name,
      email: profile.email,
      role: r.role as TeamMemberInfo["role"],
      membershipId: String(r.id),
      legacyPlayerId,
    };
  });
}

export async function loadNormalizedIdentity(
  client: SupabaseClient,
  email: string,
): Promise<NormalizedIdentity | null> {
  const { data: profileRow, error: profileError } = await client
    .from("profiles")
    .select(
      "id, auth_user_id, email, display_name, avatar_url, account_status",
    )
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (profileError && isIdentitySchemaUnavailable(profileError)) return null;
  if (profileError) throw profileError;
  if (!profileRow) return { profile: null, memberships: [] };

  const { data: membershipRows, error: membershipError } = await client
    .from("team_memberships")
    .select(
      "id, profile_id, team_id, role, status, is_default, legacy_player_id",
    )
    .eq("profile_id", profileRow.id)
    .order("is_default", { ascending: false })
    .order("joined_at", { ascending: true });

  if (membershipError && isIdentitySchemaUnavailable(membershipError)) {
    return null;
  }
  if (membershipError) throw membershipError;

  return {
    profile: {
      id: String(profileRow.id),
      authUserId: profileRow.auth_user_id
        ? String(profileRow.auth_user_id)
        : null,
      email: String(profileRow.email),
      displayName: String(profileRow.display_name),
      avatarUrl: profileRow.avatar_url ? String(profileRow.avatar_url) : null,
      accountStatus: profileRow.account_status as NormalizedProfile["accountStatus"],
    },
    memberships: (membershipRows ?? []).map((row) => ({
      id: String(row.id),
      profileId: String(row.profile_id),
      teamId: String(row.team_id),
      role: row.role as NormalizedMembership["role"],
      status: row.status as NormalizedMembership["status"],
      isDefault: Boolean(row.is_default),
      legacyPlayerId:
        typeof row.legacy_player_id === "number" ? row.legacy_player_id : null,
    })),
  };
}
