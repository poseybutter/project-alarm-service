import "server-only";

import { randomUUID } from "node:crypto";
import { TEAM_ID } from "@/lib/constants";
import {
  createServiceSupabaseClient,
  getServerUser,
} from "@/lib/serverSupabase";
import {
  ALL_ADMIN_PERMISSIONS,
  normalizeAdminRole,
  normalizeMemberStatus,
} from "@/features/admin/permissions";
import {
  loadMembershipAuthorizationIndex,
  type MembershipAuthorization,
} from "@/features/admin/server/authorizationRepository";
import {
  isIdentitySchemaUnavailable,
  loadNormalizedIdentity,
} from "@/features/identity/server/identityRepository";
import type {
  AccessRequest,
  AdminActivity,
  AdminBootstrap,
  AdminDashboard,
  AdminIdentity,
  AdminMember,
  AdminScope,
  AdminTeam,
  AdminPermission,
  MemberStatus,
  TeamModuleKey,
} from "@/features/admin/types";
import { ALL_TEAM_MODULES } from "@/features/admin/types";

type PlayerRow = {
  id: number;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  team_id: string | null;
  role: string | null;
  status: string | null;
  level: number | null;
  exp: number | null;
  created_at?: string | null;
  authorization?: MembershipAuthorization;
};

type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
};

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId = randomUUID(),
  ) {
    super(message);
  }
}

function fallbackTeamName(teamId: string | null) {
  if (!teamId) return "미배정";
  return teamId;
}

async function loadTeams(): Promise<TeamRow[]> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("teams")
    .select("id, name, description, status")
    .order("name");

  if (!error) return (data ?? []) as TeamRow[];
  if (error.code === "42703") {
    const { data: legacyTeams, error: legacyError } = await service
      .from("teams")
      .select("id, name")
      .order("name");
    if (legacyError) throw legacyError;
    return (legacyTeams ?? []).map((team) => ({
      id: String(team.id),
      name: String(team.name),
      description: null,
      status: "active" as const,
    }));
  }
  if (error.code !== "42P01") throw error;

  const { data: players, error: playersError } = await service
    .from("players")
    .select("team_id")
    .not("team_id", "is", null);
  if (playersError) throw playersError;

  const ids = Array.from(
    new Set(
      (players ?? [])
        .map((row) => row.team_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  return ids.map((id) => ({
    id,
    name: fallbackTeamName(id),
    description: null,
    status: "active" as const,
  }));
}

async function loadActor(email: string) {
  const service = createServiceSupabaseClient();
  const normalized = await loadNormalizedIdentity(service, email);
  if (normalized?.profile && normalized.memberships.length > 0) {
    const authorizationIndex = await loadMembershipAuthorizationIndex(service, {
      membershipIds: normalized.memberships.map((membership) => membership.id),
    });
    return normalized.memberships.map(
      (membership): PlayerRow => ({
        id: membership.legacyPlayerId ?? 0,
        name: normalized.profile?.displayName ?? null,
        email: normalized.profile?.email ?? email,
        avatar_url: normalized.profile?.avatarUrl ?? null,
        team_id: membership.teamId,
        role: membership.role,
        status:
          normalized.profile?.accountStatus === "active" &&
          membership.status === "active"
            ? "active"
            : "suspended",
        level: null,
        exp: null,
        authorization: authorizationIndex.byMembershipId.get(membership.id),
      }),
    );
  }

  const { data, error } = await service
    .from("players")
    .select("id, name, email, avatar_url, team_id, role, status, level, exp")
    .eq("email", email.toLowerCase())
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as PlayerRow[];
}

async function loadOrganizationAdmin(email: string) {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("organization_admins")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error?.code === "42P01" || error?.code === "42703") {
    return false;
  }
  if (error) throw error;
  return Boolean(data);
}

export async function requireAdminSession(
  requestedTeamId?: string | null,
  requiredPermission: AdminPermission = "admin.read",
): Promise<AdminBootstrap> {
  const { user } = await getServerUser();
  if (!user?.email) throw new AdminApiError("로그인이 필요합니다.", 401);

  const memberships = await loadActor(user.email);
  const activeMemberships = memberships.filter(
    (membership) => membership.status === "active",
  );
  if (activeMemberships.length === 0) {
    throw new AdminApiError("활성화된 소속이 없습니다.", 403);
  }

  const adminMemberships = activeMemberships.filter((membership) =>
    membershipPermissions(membership).includes("admin.read"),
  );
  const isOrganizationAdmin = await loadOrganizationAdmin(
    user.email,
  );
  if (!isOrganizationAdmin && adminMemberships.length === 0) {
    throw new AdminApiError("관리자 권한이 없습니다.", 403);
  }

  const teams = await loadTeams();
  const allowedTeamIds = new Set(
    isOrganizationAdmin
      ? teams.map((team) => team.id)
      : adminMemberships
          .map((membership) => membership.team_id)
          .filter((id): id is string => Boolean(id)),
  );

  if (requestedTeamId && !allowedTeamIds.has(requestedTeamId)) {
    throw new AdminApiError("선택한 팀을 관리할 권한이 없습니다.", 403);
  }

  const teamScopes: AdminScope[] = teams
    .filter((team) => team.status === "active")
    .filter((team) => allowedTeamIds.has(team.id))
    .map((team) => ({
      kind: "team",
      teamId: team.id,
      label: team.name,
      permissions:
        adminMemberships.find((membership) => membership.team_id === team.id)
          ?.authorization?.permissions ?? [...ALL_ADMIN_PERMISSIONS],
    }));
  const scopes: AdminScope[] = isOrganizationAdmin
    ? [
        {
          kind: "organization",
          teamId: null,
          label: "조직 전체",
          permissions: [...ALL_ADMIN_PERMISSIONS],
        },
        ...teams
          .filter((team) => team.status === "active")
          .map((team) => ({
            kind: "team" as const,
            teamId: team.id,
            label: team.name,
            permissions: [...ALL_ADMIN_PERMISSIONS],
          })),
      ]
    : teamScopes;
  const currentScope = requestedTeamId
    ? (scopes.find((scope) => scope.teamId === requestedTeamId) ?? scopes[0])
    : scopes[0];
  if (!currentScope) {
    throw new AdminApiError("관리 가능한 팀이 없습니다.", 403);
  }
  if (!currentScope.permissions.includes(requiredPermission)) {
    throw new AdminApiError("이 작업을 수행할 권한이 없습니다.", 403);
  }

  const first = memberships[0];
  const identity: AdminIdentity = {
    email: user.email,
    name:
      first?.name ||
      (user.user_metadata?.full_name as string | undefined) ||
      user.email.split("@")[0],
    avatarUrl: first?.avatar_url ?? null,
    isOrganizationAdmin,
  };

  return { identity, scopes, currentScope };
}

function membershipPermissions(membership: PlayerRow): AdminPermission[] {
  if (membership.authorization) return membership.authorization.permissions;
  return membership.role === "admin"
    ? [...ALL_ADMIN_PERMISSIONS]
    : [];
}

function applyScope<T>(query: T, teamId: string | null): T {
  if (!teamId) return query;
  return (query as { eq: (column: string, value: string) => T }).eq(
    "team_id",
    teamId,
  );
}

function toAdminMember(
  row: PlayerRow,
  teamNames: Map<string, string>,
): AdminMember {
  const role = normalizeAdminRole(row.role);
  return {
    id: row.id,
    name: row.name || row.email?.split("@")[0] || "이름 미등록",
    email: row.email || "이메일 미등록",
    avatarUrl: row.avatar_url,
    teamId: row.team_id,
    teamName: row.team_id
      ? (teamNames.get(row.team_id) ?? fallbackTeamName(row.team_id))
      : "미배정",
    role,
    status: normalizeMemberStatus(row.status),
    level: row.level,
    exp: row.exp,
    roleId: row.authorization?.roleId ?? null,
    roleKey:
      row.authorization?.roleKey ??
      (role === "admin" ? "team_admin" : "team_member"),
    roleName:
      row.authorization?.roleName ??
      (role === "admin" ? "팀 관리자" : "구성원"),
  };
}

/**
 * team_memberships + profiles JOIN으로 구성원 조회 (정규화 경로).
 * team_memberships.status + profiles.account_status를 조합해 실제 표시 상태 결정:
 *   active    → active
 *   suspended + account_status=pending   → pending
 *   suspended + account_status=rejected  → rejected
 *   suspended + account_status=active    → suspended
 * gamification 데이터(level/exp)는 players에서 보완 (V31 호환 단계).
 */
async function queryAdminMembersNormalized(teamId: string | null): Promise<PlayerRow[]> {
  const service = createServiceSupabaseClient();

  let tmQuery = service
    .from("team_memberships")
    .select(
      "legacy_player_id, team_id, role, status, profiles!inner(display_name, email, avatar_url, account_status)",
    );
  if (teamId) tmQuery = tmQuery.eq("team_id", teamId);
  const { data: tmRows, error: tmError } = await tmQuery;
  if (tmError) throw tmError;

  // gamification 데이터는 players에서 보완 (team_memberships에 없음)
  const legacyIds = (tmRows ?? [])
    .map((r) => r.legacy_player_id)
    .filter((id): id is number => typeof id === "number" && id > 0);

  const levelMap = new Map<number, { level: number | null; exp: number | null }>();
  if (legacyIds.length > 0) {
    const { data: playerRows } = await service
      .from("players")
      .select("id, level, exp")
      .in("id", legacyIds);
    for (const p of playerRows ?? []) {
      levelMap.set(Number(p.id), {
        level: typeof p.level === "number" ? p.level : null,
        exp: typeof p.exp === "number" ? p.exp : null,
      });
    }
  }

  return (tmRows ?? [])
    .flatMap((r) => {
      // legacy_player_id 없는 행은 건너뜀 (PATCH·React key 충돌 방지)
      if (typeof r.legacy_player_id !== "number" || r.legacy_player_id <= 0) {
        return [];
      }
      const profile = r.profiles as unknown as {
        display_name: string;
        email: string;
        avatar_url: string | null;
        account_status: string;
      };
      const legacyId = r.legacy_player_id;
      const gm = levelMap.get(legacyId);
      const effectiveStatus =
        r.status === "active"
          ? "active"
          : profile.account_status === "pending"
            ? "pending"
            : profile.account_status === "rejected"
              ? "rejected"
              : "suspended";
      return [{
        id: legacyId,
        name: profile.display_name ?? null,
        email: profile.email ?? null,
        avatar_url: profile.avatar_url ?? null,
        team_id: r.team_id ? String(r.team_id) : null,
        role: r.role ?? null,
        status: effectiveStatus,
        level: gm?.level ?? null,
        exp: gm?.exp ?? null,
      } as PlayerRow];
    })
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));
}

async function queryAdminMembers(
  teamId: string | null,
  knownTeams?: TeamRow[],
) {
  const service = createServiceSupabaseClient();
  const teams = knownTeams ?? (await loadTeams());
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  let rows: PlayerRow[];
  try {
    rows = await queryAdminMembersNormalized(teamId);
  } catch (err) {
    if (!isIdentitySchemaUnavailable(err)) throw err;
    // V31 미적용 환경 폴백: players 직접 조회
    let legacyQuery = service
      .from("players")
      .select("id, name, email, avatar_url, team_id, role, status, level, exp")
      .order("name");
    legacyQuery = applyScope(legacyQuery, teamId);
    const { data, error } = await legacyQuery;
    if (error) throw error;
    rows = (data ?? []) as PlayerRow[];
  }

  const authorizationIndex = await loadMembershipAuthorizationIndex(service, {
    legacyPlayerIds: rows.map((row) => row.id).filter((id) => id > 0),
  });
  return rows.map((row) =>
    toAdminMember(
      {
        ...row,
        authorization: authorizationIndex.byLegacyPlayerId.get(row.id),
      },
      teamNames,
    ),
  );
}

export async function listAdminMembers(teamId: string | null) {
  const bootstrap = await requireAdminSession(teamId, "members.read");
  return queryAdminMembers(bootstrap.currentScope.teamId);
}

export async function listAccessRequests(teamId: string | null) {
  const bootstrap = await requireAdminSession(teamId, "requests.review");
  const effectiveTeamId = bootstrap.currentScope.teamId;
  const teams = await loadTeams();
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const members = await queryAdminMembers(effectiveTeamId, teams);
  const pendingMembers = members
    .filter(
      (member) => member.status === "pending" || member.status === "rejected",
    )
    .filter((member) => !effectiveTeamId || member.teamId === effectiveTeamId);

  if (pendingMembers.length === 0) return [];

  const service = createServiceSupabaseClient();
  const emails = Array.from(
    new Set(pendingMembers.map((member) => member.email.toLowerCase())),
  );
  const { data: profileRows, error: profileError } = await service
    .from("profiles")
    .select("id, email")
    .in("email", emails);

  if (profileError && !isIdentitySchemaUnavailable(profileError)) {
    throw profileError;
  }

  const profiles = profileError
    ? []
    : ((profileRows ?? []) as { id: string; email: string }[]);
  const emailByProfileId = new Map(
    profiles.map((profile) => [profile.id, profile.email.toLowerCase()]),
  );
  const requestByEmail = new Map<
    string,
    { requestedTeamId: string | null; requestedAt: string | null }
  >();

  if (profiles.length > 0) {
    const { data: requestRows, error: requestError } = await service
      .from("access_requests")
      .select("profile_id, requested_team_id, requested_at")
      .in(
        "profile_id",
        profiles.map((profile) => profile.id),
      )
      .in("status", ["pending", "rejected"])
      .order("requested_at", { ascending: false });

    if (requestError && !isIdentitySchemaUnavailable(requestError)) {
      throw requestError;
    }

    for (const request of requestRows ?? []) {
      const email = emailByProfileId.get(String(request.profile_id));
      if (!email || requestByEmail.has(email)) continue;
      requestByEmail.set(email, {
        requestedTeamId: request.requested_team_id
          ? String(request.requested_team_id)
          : null,
        requestedAt: request.requested_at
          ? String(request.requested_at)
          : null,
      });
    }
  }

  return pendingMembers.map((member): AccessRequest => {
    const request = requestByEmail.get(member.email.toLowerCase());
    const requestedTeamId = request?.requestedTeamId ?? member.teamId;
    return {
      ...member,
      teamId: requestedTeamId,
      teamName: requestedTeamId
        ? (teamNames.get(requestedTeamId) ?? requestedTeamId)
        : member.teamName,
      requestedAt: request?.requestedAt ?? null,
    };
  });
}

async function countScopedRows(table: string, teamId: string | null) {
  const service = createServiceSupabaseClient();
  let query = service.from(table).select("id", { count: "exact", head: true });
  query = applyScope(query, teamId);
  const { count, error } = await query;
  if (error) {
    if (error.code === "42P01" || error.code === "42703") return 0;
    throw error;
  }
  return count ?? 0;
}

async function countOpenTasks(teamId: string | null) {
  const service = createServiceSupabaseClient();
  let query = service
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .neq("status", "완료");
  query = applyScope(query, teamId);
  const { count, error } = await query;
  if (error) {
    if (error.code === "42P01" || error.code === "42703") return 0;
    throw error;
  }
  return count ?? 0;
}

async function queryAdminAuditLogs(
  teamId: string | null,
): Promise<AdminActivity[]> {
  const service = createServiceSupabaseClient();
  let query = service
    .from("admin_audit_logs")
    .select("id, action, actor_email, target_label, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  query = applyScope(query, teamId);
  const { data, error } = await query;
  if (error?.code === "42P01") return [];
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    action: String(row.action),
    actorEmail: String(row.actor_email),
    targetLabel: String(row.target_label ?? "-"),
    createdAt: String(row.created_at),
  }));
}

export async function listAdminAuditLogs(
  teamId: string | null,
): Promise<AdminActivity[]> {
  const bootstrap = await requireAdminSession(teamId, "audit.read");
  return queryAdminAuditLogs(bootstrap.currentScope.teamId);
}

export async function getAdminDashboard(
  teamId: string | null,
): Promise<AdminDashboard> {
  const bootstrap = await requireAdminSession(teamId);
  const effectiveTeamId = bootstrap.currentScope.teamId;
  const teams = await loadTeams();
  const [allMembers, activeProjects, openTasks, recentActivity] =
    await Promise.all([
      queryAdminMembers(effectiveTeamId, teams),
      countScopedRows("projects", effectiveTeamId),
      countOpenTasks(effectiveTeamId),
      queryAdminAuditLogs(effectiveTeamId),
    ]);

  const scopeTeams = effectiveTeamId
    ? teams.filter((team) => team.id === effectiveTeamId)
    : teams.filter((team) => team.status === "active");
  const teamSummaries: AdminTeam[] = await Promise.all(
    scopeTeams.map(async (team) => {
      const teamMembers = allMembers.filter(
        (member) => member.teamId === team.id,
      );
      return {
        ...team,
        memberCount: teamMembers.filter((member) => member.status === "active")
          .length,
        adminCount: teamMembers.filter(
          (member) => member.status === "active" && member.role === "admin",
        ).length,
        projectCount: await countScopedRows("projects", team.id),
        modules: ALL_TEAM_MODULES,
      };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      members: allMembers.filter((member) => member.status === "active").length,
      pendingRequests: allMembers.filter(
        (member) => member.status === "pending",
      ).length,
      suspendedMembers: allMembers.filter(
        (member) => member.status === "suspended",
      ).length,
      activeProjects,
      openTasks,
    },
    teams: teamSummaries,
    recentActivity: recentActivity.slice(0, 8),
  };
}

export async function writeAdminAudit(input: {
  actorEmail: string;
  action: string;
  teamId: string | null;
  targetType: string;
  targetId: string;
  targetLabel: string;
  beforeState?: unknown;
  afterState?: unknown;
}) {
  const service = createServiceSupabaseClient();
  const { error } = await service.from("admin_audit_logs").insert({
    actor_email: input.actorEmail,
    action: input.action,
    team_id: input.teamId,
    target_type: input.targetType,
    target_id: input.targetId,
    target_label: input.targetLabel,
    before_state: input.beforeState ?? null,
    after_state: input.afterState ?? null,
  });
  if (error && error.code !== "42P01") throw error;
}

async function annotateNormalizedAccessReview(input: {
  email: string | null;
  decision: "approve" | "reject";
  teamId?: string;
  role?: "admin" | "member";
  actorEmail: string;
}) {
  if (!input.email) return;
  const service = createServiceSupabaseClient();
  try {
    const normalized = await loadNormalizedIdentity(service, input.email);
    if (!normalized?.profile) return;
    const status = input.decision === "approve" ? "approved" : "rejected";
    const { error } = await service
      .from("access_requests")
      .update({
        reviewed_by_email: input.actorEmail,
        reviewed_at: new Date().toISOString(),
        ...(input.decision === "approve"
          ? {
              assigned_team_id: input.teamId,
              assigned_role: input.role ?? "member",
            }
          : {}),
      })
      .eq("profile_id", normalized.profile.id)
      .eq("status", status)
      .is("reviewed_by_email", null);
    if (error && !isIdentitySchemaUnavailable(error)) throw error;
  } catch (error) {
    // The legacy players update is authoritative during the compatibility phase.
    console.error("[admin-normalization] access review metadata failed", error);
  }
}

export async function reviewAccessRequest(input: {
  id: number;
  decision: "approve" | "reject";
  teamId?: string;
  role?: "admin" | "member";
}) {
  const bootstrap = await requireAdminSession(
    input.teamId ?? null,
    "requests.review",
  );
  const service = createServiceSupabaseClient();
  const { data: before, error: beforeError } = await service
    .from("players")
    .select("id, name, email, team_id, role, status")
    .eq("id", input.id)
    .maybeSingle();
  if (beforeError) throw beforeError;
  if (!before) throw new AdminApiError("접근 요청을 찾을 수 없습니다.", 404);
  const canReviewTarget =
    bootstrap.identity.isOrganizationAdmin ||
    bootstrap.scopes.some(
      (scope) =>
        scope.kind === "team" &&
        scope.teamId === before.team_id &&
        (!input.teamId || input.teamId === before.team_id),
    );
  if (!canReviewTarget) {
    throw new AdminApiError("이 접근 요청을 검토할 권한이 없습니다.", 403);
  }
  if (before.status !== "pending") {
    throw new AdminApiError("이미 처리된 접근 요청입니다.", 409);
  }
  if (input.decision === "approve" && !input.teamId) {
    throw new AdminApiError("승인할 팀을 선택해 주세요.", 400);
  }

  const after =
    input.decision === "approve"
      ? {
          status: "active" as const,
          team_id: input.teamId,
          role: input.role ?? "member",
        }
      : { status: "rejected" as const };
  const { data, error } = await service
    .from("players")
    .update(after)
    .eq("id", input.id)
    .eq("status", "pending")
    .select("id, name, email, team_id, role, status")
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new AdminApiError("요청 상태가 변경되어 처리하지 못했습니다.", 409);

  await annotateNormalizedAccessReview({
    email: data.email,
    decision: input.decision,
    teamId: data.team_id ?? undefined,
    role: data.role === "admin" ? "admin" : "member",
    actorEmail: bootstrap.identity.email,
  });

  await writeAdminAudit({
    actorEmail: bootstrap.identity.email,
    action:
      input.decision === "approve"
        ? "access_request.approved"
        : "access_request.rejected",
    teamId: data.team_id,
    targetType: "player",
    targetId: String(input.id),
    targetLabel: data.name || data.email || String(input.id),
    beforeState: before,
    afterState: data,
  });
  return data;
}

export async function updateAdminMember(input: {
  id: number;
  teamId: string;
  role?: "admin" | "member";
  roleId?: string;
  status?: Extract<MemberStatus, "active" | "suspended">;
}) {
  const bootstrap = await requireAdminSession(input.teamId, "members.manage");
  const service = createServiceSupabaseClient();
  const { data: before, error: beforeError } = await service
    .from("players")
    .select("id, name, email, team_id, role, status")
    .eq("id", input.id)
    .maybeSingle();
  if (beforeError) throw beforeError;
  if (!before) throw new AdminApiError("구성원을 찾을 수 없습니다.", 404);
  if (before.team_id !== input.teamId) {
    throw new AdminApiError("선택한 팀의 구성원이 아닙니다.", 400);
  }

  let targetRole: {
    id: string;
    team_id: string | null;
    role_key: string;
    name: string;
  } | null = null;
  if (input.roleId) {
    const { data: roleRow, error: roleError } = await service
      .from("roles")
      .select("id, team_id, role_key, name, status")
      .eq("id", input.roleId)
      .eq("status", "active")
      .maybeSingle();
    if (roleError && isIdentitySchemaUnavailable(roleError)) {
      throw new AdminApiError("V32 역할·권한 마이그레이션이 필요합니다.", 503);
    }
    if (roleError) throw roleError;
    if (
      !roleRow ||
      (roleRow.team_id !== null && roleRow.team_id !== input.teamId)
    ) {
      throw new AdminApiError("이 팀에 배정할 수 없는 역할입니다.", 400);
    }
    targetRole = roleRow;
  }

  const removesOwnAccess =
    before.email === bootstrap.identity.email &&
    (Boolean(input.roleId) ||
      input.role === "member" ||
      input.status === "suspended");
  if (removesOwnAccess) {
    throw new AdminApiError(
      "자신의 관리자 권한은 직접 해제할 수 없습니다.",
      409,
    );
  }

  if (
    before.role === "admin" &&
    (input.role === "member" ||
      (targetRole && targetRole.role_key !== "team_admin") ||
      input.status === "suspended")
  ) {
    const { count, error: countError } = await service
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("team_id", input.teamId)
      .eq("role", "admin")
      .eq("status", "active");
    if (countError) throw countError;
    if ((count ?? 0) <= 1) {
      throw new AdminApiError("팀의 마지막 관리자는 변경할 수 없습니다.", 409);
    }
  }

  const changes = {
    ...(input.role ? { role: input.role } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  if (Object.keys(changes).length === 0 && !input.roleId) {
    throw new AdminApiError("변경할 항목이 없습니다.", 400);
  }

  if (input.roleId && input.role) {
    throw new AdminApiError("roleId와 role은 함께 변경할 수 없습니다.", 400);
  }

  if (input.roleId) {
    const { error: rpcError } = await service.rpc(
      "admin_update_member_access",
      {
        p_player_id: input.id,
        p_role_id: input.roleId,
        p_status: input.status ?? null,
      },
    );
    if (rpcError && isIdentitySchemaUnavailable(rpcError)) {
      throw new AdminApiError("V32 역할·권한 마이그레이션이 필요합니다.", 503);
    }
    if (rpcError) throw rpcError;

    const { data: afterPlayer, error: afterError } = await service
      .from("players")
      .select("id, name, email, team_id, role, status")
      .eq("id", input.id)
      .maybeSingle();
    if (afterError) throw afterError;

    await writeAdminAudit({
      actorEmail: bootstrap.identity.email,
      action: "member.updated",
      teamId: input.teamId,
      targetType: "player",
      targetId: String(input.id),
      targetLabel: before.name || before.email || String(input.id),
      beforeState: before,
      afterState: { ...afterPlayer, assignedRole: targetRole },
    });
    return afterPlayer;
  }

  // 상태 변경만 있을 때: RPC로 players + team_memberships 동시 업데이트
  // 역할 변경이 포함된 경우: players 직접 업데이트, V31 트리거가 team_memberships 동기화
  if (input.status && !input.role) {
    const { error: rpcError } = await service.rpc("admin_update_member_access", {
      p_player_id: input.id,
      p_role_id: null,
      p_status: input.status,
    });
    if (rpcError) {
      // PGRST202: RPC 함수 미존재 (V32 미적용), 스키마 오류 → players 직접 폴백
      const shouldFallback =
        isIdentitySchemaUnavailable(rpcError) ||
        (rpcError as { code?: string }).code === "PGRST202";
      if (!shouldFallback) throw rpcError;
      const { error: fallbackError } = await service
        .from("players")
        .update(changes)
        .eq("id", input.id);
      if (fallbackError) throw fallbackError;
    }
  } else {
    const { error } = await service
      .from("players")
      .update(changes)
      .eq("id", input.id);
    if (error) throw error;
  }

  const { data, error: readError } = await service
    .from("players")
    .select("id, name, email, team_id, role, status")
    .eq("id", input.id)
    .maybeSingle();
  if (readError) throw readError;

  await writeAdminAudit({
    actorEmail: bootstrap.identity.email,
    action: "member.updated",
    teamId: input.teamId,
    targetType: "player",
    targetId: String(input.id),
    targetLabel: before.name || before.email || String(input.id),
    beforeState: before,
    afterState: data,
  });
  return data;
}

/**
 * 이미 다른 팀 소속인 프로필을 두 번째 팀에 추가한다.
 * players는 팀 1개만 표현 가능하므로 이 멤버십은 legacy_player_id 없이
 * team_memberships에만 생성한다 (is_default=false, 기존 기본 팀 유지).
 */
export async function addTeamMembership(input: {
  email: string;
  teamId: string;
  role: "admin" | "member" | "viewer";
}) {
  const bootstrap = await requireAdminSession(input.teamId, "members.manage");
  const service = createServiceSupabaseClient();
  const email = input.email.trim().toLowerCase();

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, display_name, email, account_status")
    .eq("email", email)
    .maybeSingle();
  if (profileError && isIdentitySchemaUnavailable(profileError)) {
    throw new AdminApiError("V31 정규화 마이그레이션이 필요합니다.", 503);
  }
  if (profileError) throw profileError;
  if (!profile) {
    throw new AdminApiError(
      "로그인 이력이 있는 사용자만 다른 팀에 추가할 수 있습니다.",
      404,
    );
  }
  if (profile.account_status !== "active") {
    throw new AdminApiError("활성 상태 사용자만 다른 팀에 추가할 수 있습니다.", 409);
  }

  const { data: existing, error: existingError } = await service
    .from("team_memberships")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("team_id", input.teamId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    throw new AdminApiError("이미 해당 팀 소속입니다.", 409);
  }

  const { data: membership, error: insertError } = await service
    .from("team_memberships")
    .insert({
      profile_id: profile.id,
      team_id: input.teamId,
      role: input.role,
      status: "active",
      is_default: false,
      legacy_player_id: null,
    })
    .select("id, team_id, role, status, is_default")
    .single();
  if (insertError?.code === "23505") {
    throw new AdminApiError("이미 해당 팀 소속입니다.", 409);
  }
  if (insertError) throw insertError;

  await writeAdminAudit({
    actorEmail: bootstrap.identity.email,
    action: "membership.added",
    teamId: input.teamId,
    targetType: "team_membership",
    targetId: membership.id,
    targetLabel: profile.display_name || profile.email,
    afterState: membership,
  });

  return membership;
}

export async function listTeamsWithCounts() {
  const bootstrap = await requireAdminSession(null, "teams.read");
  const effectiveTeamId = bootstrap.currentScope.teamId;
  const allTeams = await loadTeams();
  const members = await queryAdminMembers(effectiveTeamId, allTeams);
  const teams = effectiveTeamId
    ? allTeams.filter((team) => team.id === effectiveTeamId)
    : allTeams;

  const service = createServiceSupabaseClient();
  const teamIds = teams.map((team) => team.id);
  const { data: moduleRows } = await service
    .from("team_modules")
    .select("team_id, module, enabled")
    .in("team_id", teamIds);

  const modulesByTeam = new Map<string, string[]>();
  for (const row of moduleRows ?? []) {
    if (!row.enabled) continue;
    const list = modulesByTeam.get(row.team_id) ?? [];
    list.push(row.module);
    modulesByTeam.set(row.team_id, list);
  }

  return Promise.all(
    teams.map(async (team): Promise<AdminTeam> => {
      const teamMembers = members.filter((member) => member.teamId === team.id);
      return {
        ...team,
        memberCount: teamMembers.filter((member) => member.status === "active")
          .length,
        adminCount: teamMembers.filter(
          (member) => member.status === "active" && member.role === "admin",
        ).length,
        projectCount: await countScopedRows("projects", team.id),
        modules: (modulesByTeam.get(team.id) ?? ALL_TEAM_MODULES) as AdminTeam["modules"],
      };
    }),
  );
}

export async function createAdminTeam(input: {
  id: string;
  name: string;
  description?: string;
  modules?: TeamModuleKey[];
}) {
  const bootstrap = await requireAdminSession(null, "teams.manage");
  if (!bootstrap.identity.isOrganizationAdmin) {
    throw new AdminApiError("조직 관리자만 팀을 만들 수 있습니다.", 403);
  }
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(input.id)) {
    throw new AdminApiError(
      "팀 ID는 영문 소문자, 숫자, 하이픈으로 입력해 주세요.",
      400,
    );
  }
  const name = input.name.trim();
  if (name.length < 2 || name.length > 40) {
    throw new AdminApiError("팀 이름은 2~40자로 입력해 주세요.", 400);
  }
  if (input.description && input.description.trim().length > 200) {
    throw new AdminApiError("팀 설명은 200자 이하로 입력해 주세요.", 400);
  }
  const service = createServiceSupabaseClient();
  const row = {
    id: input.id,
    name,
    description: input.description?.trim() || null,
    status: "active",
  };
  const { data, error } = await service
    .from("teams")
    .insert(row)
    .select("id, name, description, status")
    .single();
  if (error?.code === "42P01" || error?.code === "42703") {
    throw new AdminApiError(
      "V29 관리자 기반 마이그레이션을 먼저 실행해 주세요.",
      503,
    );
  }
  if (error?.code === "23505") {
    throw new AdminApiError("이미 사용 중인 팀 ID입니다.", 409);
  }
  if (error) throw error;

  // 모듈 초기화: 선택된 모듈만 활성화, 나머지 비활성화
  const enabledModules = new Set(input.modules ?? ALL_TEAM_MODULES);
  const moduleRows = ALL_TEAM_MODULES.map((module) => ({
    team_id: data.id,
    module,
    enabled: enabledModules.has(module),
  }));
  await service.from("team_modules").insert(moduleRows);

  await writeAdminAudit({
    actorEmail: bootstrap.identity.email,
    action: "team.created",
    teamId: data.id,
    targetType: "team",
    targetId: data.id,
    targetLabel: data.name,
    afterState: { ...data, modules: [...enabledModules] },
  });
  return data;
}

async function requireOrganizationAdmin() {
  const bootstrap = await requireAdminSession(null, "teams.manage");
  if (!bootstrap.identity.isOrganizationAdmin) {
    throw new AdminApiError("조직 관리자만 팀을 변경할 수 있습니다.", 403);
  }
  return bootstrap;
}

async function loadTeamForMutation(teamId: string) {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("teams")
    .select("id, name, description, status")
    .eq("id", teamId)
    .maybeSingle();

  if (error?.code === "42P01" || error?.code === "42703") {
    throw new AdminApiError(
      "V29 관리자 기반 마이그레이션을 먼저 실행해 주세요.",
      503,
    );
  }
  if (error) throw error;
  if (!data) throw new AdminApiError("팀을 찾을 수 없습니다.", 404);
  return data as TeamRow;
}

export async function updateAdminTeam(input: {
  id: string;
  name: string;
  description?: string;
  status: "active" | "archived";
  modules?: TeamModuleKey[];
}) {
  const bootstrap = await requireOrganizationAdmin();
  const before = await loadTeamForMutation(input.id);
  const name = input.name.trim();

  if (name.length < 2 || name.length > 40) {
    throw new AdminApiError("팀 이름은 2~40자로 입력해 주세요.", 400);
  }
  if (input.description && input.description.trim().length > 200) {
    throw new AdminApiError("팀 설명은 200자 이하로 입력해 주세요.", 400);
  }
  if (input.id === TEAM_ID && input.status === "archived") {
    throw new AdminApiError(
      "기본 운영팀은 현재 업무 화면에서 사용 중이므로 보관할 수 없습니다.",
      409,
    );
  }

  const changes = {
    name,
    description: input.description?.trim() || null,
    status: input.status,
    archived_at: input.status === "archived" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("teams")
    .update(changes)
    .eq("id", input.id)
    .select("id, name, description, status")
    .maybeSingle();

  if (error?.code === "42703") {
    throw new AdminApiError(
      "V29 관리자 기반 마이그레이션을 다시 실행해 팀 관리 컬럼을 추가해 주세요.",
      503,
    );
  }
  if (error) throw error;
  if (!data) throw new AdminApiError("팀을 찾을 수 없습니다.", 404);

  if (input.modules) {
    const service2 = createServiceSupabaseClient();
    const enabledModules = new Set(input.modules);
    const moduleRows = ALL_TEAM_MODULES.map((module) => ({
      team_id: input.id,
      module,
      enabled: enabledModules.has(module),
    }));
    await service2
      .from("team_modules")
      .upsert(moduleRows, { onConflict: "team_id,module" });
  }

  await writeAdminAudit({
    actorEmail: bootstrap.identity.email,
    action:
      before.status !== data.status
        ? data.status === "archived"
          ? "team.archived"
          : "team.restored"
        : "team.updated",
    teamId: data.id,
    targetType: "team",
    targetId: data.id,
    targetLabel: data.name,
    beforeState: before,
    afterState: data,
  });
  return data;
}

const TEAM_DEPENDENCY_TABLES = [
  ["team_memberships", "팀 멤버십"],
  ["roles", "역할"],
  ["invitations", "초대"],
  ["players", "구성원"],
  ["projects", "프로젝트"],
  ["tasks", "업무"],
  ["quests", "퀘스트"],
  ["accessibility", "접근성 기록"],
  ["attendance", "출석 기록"],
  ["briefings", "브리핑"],
  ["briefing_tasks", "브리핑 업무"],
  ["assignments", "담당 배정"],
  ["agent_suggestions", "에이전트 제안"],
  ["agent_notification_deliveries", "알림 발송 기록"],
  ["agent_member_webhooks", "웹훅"],
  ["agent_personal_reminders", "개인 알림"],
  ["agent_calendar_connections", "캘린더 연결"],
  ["agent_calendar_events", "캘린더 일정"],
  ["agent_member_notification_settings", "알림 설정"],
  ["agent_team_calendar_settings", "팀 캘린더 설정"],
  ["agent_member_calendar_settings", "구성원 캘린더 설정"],
  ["agent_accessibility_mission_snoozes", "접근성 알림 설정"],
] as const;

async function countTeamDependencies(teamId: string) {
  const service = createServiceSupabaseClient();
  const counts = await Promise.all(
    TEAM_DEPENDENCY_TABLES.map(async ([table, label]) => {
      const { count, error } = await service
        .from(table)
        .select("team_id", { count: "exact", head: true })
        .eq("team_id", teamId);
      if (error?.code === "42P01" || error?.code === "42703") {
        return { table, label, count: 0 };
      }
      if (error) throw error;
      return { table, label, count: count ?? 0 };
    }),
  );
  return counts.filter((item) => item.count > 0);
}

export async function deleteAdminTeam(teamId: string) {
  const bootstrap = await requireOrganizationAdmin();
  const before = await loadTeamForMutation(teamId);

  if (teamId === TEAM_ID) {
    throw new AdminApiError(
      "기본 운영팀(ud2)은 기존 업무·리포트 기능이 고정 참조하므로 삭제할 수 없습니다.",
      409,
    );
  }

  const dependencies = await countTeamDependencies(teamId);
  if (dependencies.length > 0) {
    const summary = dependencies
      .slice(0, 4)
      .map((item) => `${item.label} ${item.count}건`)
      .join(", ");
    const remainder = dependencies.length > 4 ? " 외 연결 데이터" : "";
    throw new AdminApiError(
      `연결 데이터가 있어 영구 삭제할 수 없습니다 (${summary}${remainder}). 팀을 보관하거나 데이터를 먼저 이동해 주세요.`,
      409,
    );
  }

  const service = createServiceSupabaseClient();
  const { error } = await service.from("teams").delete().eq("id", teamId);
  if (error?.code === "23503") {
    throw new AdminApiError(
      "연결된 데이터가 남아 있어 팀을 삭제할 수 없습니다. 팀 멤버십·역할·초대 등을 먼저 정리해 주세요.",
      409,
    );
  }
  if (error) throw error;

  await writeAdminAudit({
    actorEmail: bootstrap.identity.email,
    action: "team.deleted",
    teamId: null,
    targetType: "team",
    targetId: before.id,
    targetLabel: before.name,
    beforeState: before,
  });
}

export async function getIntegrationOverview(teamId: string | null) {
  const bootstrap = await requireAdminSession(teamId, "integrations.read");
  const effectiveTeamId = bootstrap.currentScope.teamId;
  const service = createServiceSupabaseClient();

  async function rows(
    table: string,
    columns: string,
  ): Promise<Record<string, unknown>[]> {
    let query = service.from(table).select(columns);
    query = applyScope(query, effectiveTeamId);
    const { data, error } = await query;
    if (error?.code === "42P01") return [];
    if (error) throw error;
    return (data ?? []) as unknown as Record<string, unknown>[];
  }

  const [teamCalendars, calendarConnections, webhooks, notificationSettings] =
    await Promise.all([
      rows(
        "agent_team_calendar_settings",
        "team_id, calendar_id, connection_email, updated_at",
      ),
      rows(
        "agent_calendar_connections",
        "team_id, email, google_email, connected_at, updated_at",
      ),
      rows("agent_member_webhooks", "team_id, member, email, updated_at"),
      rows(
        "agent_member_notification_settings",
        "team_id, member, email, morning_enabled, morning_send_time, updated_at",
      ),
    ]);

  return {
    teamCalendars,
    calendarConnections,
    webhookCount: webhooks.length,
    notificationCount: notificationSettings.length,
    morningEnabledCount: notificationSettings.filter(
      (row) => row.morning_enabled !== false,
    ).length,
  };
}
