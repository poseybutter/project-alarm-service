import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_ADMIN_PERMISSIONS } from "@/features/admin/permissions";
import type { AdminPermission } from "@/features/admin/types";
import { isIdentitySchemaUnavailable } from "@/features/identity/server/identityRepository";

type MembershipRoleRow = {
  id: string;
  legacy_player_id: number | null;
  role: string;
  role_id: string | null;
};

type RoleRow = {
  id: string;
  role_key: string;
  name: string;
  status: string;
};

export type MembershipAuthorization = {
  membershipId: string;
  legacyPlayerId: number | null;
  roleId: string | null;
  roleKey: string;
  roleName: string;
  permissions: AdminPermission[];
};

export type MembershipAuthorizationIndex = {
  schemaReady: boolean;
  byMembershipId: Map<string, MembershipAuthorization>;
  byLegacyPlayerId: Map<number, MembershipAuthorization>;
};

function legacyAuthorization(row: MembershipRoleRow): MembershipAuthorization {
  const isAdmin = row.role === "admin";
  return {
    membershipId: row.id,
    legacyPlayerId: row.legacy_player_id,
    roleId: null,
    roleKey: isAdmin ? "team_admin" : "team_member",
    roleName: isAdmin ? "팀 관리자" : "구성원",
    permissions: isAdmin ? [...ALL_ADMIN_PERMISSIONS] : [],
  };
}

function buildIndex(
  rows: MembershipRoleRow[],
  authorizations: MembershipAuthorization[],
  schemaReady: boolean,
): MembershipAuthorizationIndex {
  const byMembershipId = new Map<string, MembershipAuthorization>();
  const byLegacyPlayerId = new Map<number, MembershipAuthorization>();

  for (const authorization of authorizations) {
    byMembershipId.set(authorization.membershipId, authorization);
    if (authorization.legacyPlayerId !== null) {
      byLegacyPlayerId.set(authorization.legacyPlayerId, authorization);
    }
  }

  for (const row of rows) {
    if (byMembershipId.has(row.id)) continue;
    const authorization = row.role_id
      ? {
          membershipId: row.id,
          legacyPlayerId: row.legacy_player_id,
          roleId: row.role_id,
          roleKey: "unresolved",
          roleName: "권한 없음",
          permissions: [],
        }
      : legacyAuthorization(row);
    byMembershipId.set(row.id, authorization);
    if (authorization.legacyPlayerId !== null) {
      byLegacyPlayerId.set(authorization.legacyPlayerId, authorization);
    }
  }

  return { schemaReady, byMembershipId, byLegacyPlayerId };
}

export async function loadMembershipAuthorizationIndex(
  client: SupabaseClient,
  filters: { membershipIds?: string[]; legacyPlayerIds?: number[] },
): Promise<MembershipAuthorizationIndex> {
  let query = client
    .from("team_memberships")
    .select("id, legacy_player_id, role, role_id");

  if (filters.membershipIds?.length) {
    query = query.in("id", filters.membershipIds);
  } else if (filters.legacyPlayerIds?.length) {
    query = query.in("legacy_player_id", filters.legacyPlayerIds);
  } else {
    return buildIndex([], [], true);
  }

  const { data, error } = await query;
  if (error && isIdentitySchemaUnavailable(error)) {
    let legacyQuery = client
      .from("team_memberships")
      .select("id, legacy_player_id, role");
    if (filters.membershipIds?.length) {
      legacyQuery = legacyQuery.in("id", filters.membershipIds);
    } else {
      legacyQuery = legacyQuery.in(
        "legacy_player_id",
        filters.legacyPlayerIds ?? [],
      );
    }
    const { data: legacyRows, error: legacyError } = await legacyQuery;
    if (legacyError) throw legacyError;
    const rows = (legacyRows ?? []).map(
      (row): MembershipRoleRow => ({
        id: String(row.id),
        legacy_player_id:
          typeof row.legacy_player_id === "number"
            ? row.legacy_player_id
            : null,
        role: String(row.role ?? "member"),
        role_id: null,
      }),
    );
    return buildIndex(rows, rows.map(legacyAuthorization), false);
  }
  if (error) throw error;

  const rows = (data ?? []) as MembershipRoleRow[];
  const roleIds = Array.from(
    new Set(
      rows
        .map((row) => row.role_id)
        .filter((roleId): roleId is string => Boolean(roleId)),
    ),
  );
  if (roleIds.length === 0) {
    return buildIndex(rows, rows.map(legacyAuthorization), true);
  }

  const [{ data: roleRows, error: roleError }, { data: permissionRows, error: permissionError }] =
    await Promise.all([
      client
        .from("roles")
        .select("id, role_key, name, status")
        .in("id", roleIds),
      client
        .from("role_permissions")
        .select("role_id, permission_key")
        .in("role_id", roleIds),
    ]);

  if (roleError && isIdentitySchemaUnavailable(roleError)) {
    return buildIndex(rows, rows.map(legacyAuthorization), false);
  }
  if (permissionError && isIdentitySchemaUnavailable(permissionError)) {
    return buildIndex(rows, rows.map(legacyAuthorization), false);
  }
  if (roleError) throw roleError;
  if (permissionError) throw permissionError;

  const rolesById = new Map(
    ((roleRows ?? []) as RoleRow[])
      .filter((role) => role.status === "active")
      .map((role) => [role.id, role]),
  );
  const permissionsByRoleId = new Map<string, AdminPermission[]>();
  for (const row of permissionRows ?? []) {
    const permission = ALL_ADMIN_PERMISSIONS.find(
      (candidate) => candidate === row.permission_key,
    );
    if (!permission) continue;
    const roleId = String(row.role_id);
    permissionsByRoleId.set(roleId, [
      ...(permissionsByRoleId.get(roleId) ?? []),
      permission,
    ]);
  }

  const authorizations = rows.flatMap((row) => {
    const role = row.role_id ? rolesById.get(row.role_id) : undefined;
    if (!role) return [];
    return [
      {
        membershipId: row.id,
        legacyPlayerId: row.legacy_player_id,
        roleId: role.id,
        roleKey: role.role_key,
        roleName: role.name,
        permissions: permissionsByRoleId.get(role.id) ?? [],
      } satisfies MembershipAuthorization,
    ];
  });

  return buildIndex(rows, authorizations, true);
}
