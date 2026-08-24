import "server-only";

import {
  ADMIN_PERMISSION_DEFINITIONS,
  ALL_ADMIN_PERMISSIONS,
  normalizeAdminPermission,
} from "@/features/admin/permissions";
import {
  AdminApiError,
  requireAdminSession,
  writeAdminAudit,
} from "@/features/admin/server/adminRepository";
import type {
  AdminPermission,
  AdminPermissionDefinition,
  AdminRoleCatalog,
  AdminRoleDefinition,
} from "@/features/admin/types";
import { isIdentitySchemaUnavailable } from "@/features/identity/server/identityRepository";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

type PermissionRow = {
  key: string;
  name: string;
  description: string | null;
  category: string;
  risk_level: "normal" | "sensitive" | "critical";
};

type RoleRow = {
  id: string;
  team_id: string | null;
  role_key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  status: "active" | "archived";
};

function fallbackCatalog(): AdminRoleCatalog {
  const permissions: AdminPermissionDefinition[] =
    ADMIN_PERMISSION_DEFINITIONS.map((permission) => ({
      ...permission,
      description: null,
      riskLevel: "normal",
    }));
  const roles: AdminRoleDefinition[] = [
    {
      id: "legacy:team_admin",
      teamId: null,
      teamName: "모든 팀",
      key: "team_admin",
      name: "팀 관리자",
      description: "기존 players.role 관리자 호환 역할",
      isSystem: true,
      status: "active",
      permissions: [...ALL_ADMIN_PERMISSIONS],
      memberCount: 0,
    },
    {
      id: "legacy:team_member",
      teamId: null,
      teamName: "모든 팀",
      key: "team_member",
      name: "구성원",
      description: "기존 players.role 구성원 호환 역할",
      isSystem: true,
      status: "active",
      permissions: [],
      memberCount: 0,
    },
    {
      id: "legacy:team_viewer",
      teamId: null,
      teamName: "모든 팀",
      key: "team_viewer",
      name: "뷰어",
      description: "읽기 전용 전환을 위한 시스템 역할",
      isSystem: true,
      status: "active",
      permissions: [],
      memberCount: 0,
    },
  ];
  return { schemaReady: false, permissions, roles };
}

async function loadRoleForMutation(roleId: string) {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("roles")
    .select(
      "id, team_id, role_key, name, description, is_system, status",
    )
    .eq("id", roleId)
    .maybeSingle();
  if (error && isIdentitySchemaUnavailable(error)) {
    throw new AdminApiError("V32 역할·권한 마이그레이션이 필요합니다.", 503);
  }
  if (error) throw error;
  if (!data) throw new AdminApiError("역할을 찾을 수 없습니다.", 404);
  return data as RoleRow;
}

export async function listRoleCatalog(
  teamId: string | null,
): Promise<AdminRoleCatalog> {
  const bootstrap = await requireAdminSession(teamId, "roles.read");
  const effectiveTeamId = bootstrap.currentScope.teamId;
  const service = createServiceSupabaseClient();
  const [permissionResult, roleResult, teamResult] = await Promise.all([
    service
      .from("permissions")
      .select("key, name, description, category, risk_level")
      .order("category")
      .order("key"),
    service
      .from("roles")
      .select(
        "id, team_id, role_key, name, description, is_system, status",
      )
      .eq("status", "active")
      .order("is_system", { ascending: false })
      .order("name"),
    service.from("teams").select("id, name"),
  ]);

  if (
    (permissionResult.error &&
      isIdentitySchemaUnavailable(permissionResult.error)) ||
    (roleResult.error && isIdentitySchemaUnavailable(roleResult.error))
  ) {
    return fallbackCatalog();
  }
  if (permissionResult.error) throw permissionResult.error;
  if (roleResult.error) throw roleResult.error;
  if (teamResult.error) throw teamResult.error;

  const permissions = (permissionResult.data ?? []) as PermissionRow[];
  const permissionKeys = new Set(permissions.map((permission) => permission.key));
  const allRoles = (roleResult.data ?? []) as RoleRow[];
  const roleRows = allRoles.filter(
    (role) => !effectiveTeamId || role.team_id === null || role.team_id === effectiveTeamId,
  );
  const roleIds = roleRows.map((role) => role.id);
  const [rolePermissionResult, membershipResult] = roleIds.length
    ? await Promise.all([
        service
          .from("role_permissions")
          .select("role_id, permission_key")
          .in("role_id", roleIds),
        service
          .from("team_memberships")
          .select("role_id")
          .in("role_id", roleIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (rolePermissionResult.error) throw rolePermissionResult.error;
  if (membershipResult.error) throw membershipResult.error;

  const permissionMap = new Map<string, AdminPermission[]>();
  for (const row of rolePermissionResult.data ?? []) {
    const permission = normalizeAdminPermission(row.permission_key);
    if (!permission || !permissionKeys.has(permission)) continue;
    const roleId = String(row.role_id);
    permissionMap.set(roleId, [
      ...(permissionMap.get(roleId) ?? []),
      permission,
    ]);
  }
  const memberCountMap = new Map<string, number>();
  for (const row of membershipResult.data ?? []) {
    if (!row.role_id) continue;
    const roleId = String(row.role_id);
    memberCountMap.set(roleId, (memberCountMap.get(roleId) ?? 0) + 1);
  }
  const teamNames = new Map(
    (teamResult.data ?? []).map((team) => [String(team.id), String(team.name)]),
  );

  return {
    schemaReady: true,
    permissions: permissions.flatMap((permission) => {
      const key = normalizeAdminPermission(permission.key);
      return key
        ? [
            {
              key,
              name: permission.name,
              description: permission.description,
              category: permission.category,
              riskLevel: permission.risk_level,
            },
          ]
        : [];
    }),
    roles: roleRows.map((role) => ({
      id: role.id,
      teamId: role.team_id,
      teamName: role.team_id
        ? (teamNames.get(role.team_id) ?? role.team_id)
        : "모든 팀",
      key: role.role_key,
      name: role.name,
      description: role.description,
      isSystem: role.is_system,
      status: role.status,
      permissions: permissionMap.get(role.id) ?? [],
      memberCount: memberCountMap.get(role.id) ?? 0,
    })),
  };
}

function normalizeRoleInput(input: {
  teamId: string;
  key: string;
  name: string;
  description?: string;
  permissions: unknown[];
}) {
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(input.key)) {
    throw new AdminApiError(
      "역할 키는 영문 소문자, 숫자, 밑줄로 입력해 주세요.",
      400,
    );
  }
  const name = input.name.trim();
  if (name.length < 2 || name.length > 40) {
    throw new AdminApiError("역할 이름은 2~40자로 입력해 주세요.", 400);
  }
  if (input.description && input.description.trim().length > 200) {
    throw new AdminApiError("역할 설명은 200자 이하로 입력해 주세요.", 400);
  }
  const permissions = Array.from(
    new Set(input.permissions.map(normalizeAdminPermission).filter(Boolean)),
  ) as AdminPermission[];
  if (permissions.length > 0 && !permissions.includes("admin.read")) {
    permissions.unshift("admin.read");
  }
  return {
    key: input.key,
    name,
    description: input.description?.trim() ?? "",
    permissions,
  };
}

export async function saveRole(input: {
  id?: string;
  teamId: string;
  key: string;
  name: string;
  description?: string;
  permissions: unknown[];
}) {
  const bootstrap = await requireAdminSession(input.teamId, "roles.manage");
  const normalized = normalizeRoleInput(input);
  const grantedPermissions = new Set(bootstrap.currentScope.permissions);
  if (normalized.permissions.some((permission) => !grantedPermissions.has(permission))) {
    throw new AdminApiError("보유하지 않은 권한은 역할에 부여할 수 없습니다.", 403);
  }
  let before: RoleRow | null = null;
  if (input.id) {
    before = await loadRoleForMutation(input.id);
    if (before.is_system) {
      throw new AdminApiError("시스템 역할은 변경할 수 없습니다.", 409);
    }
    if (before.team_id !== input.teamId) {
      throw new AdminApiError("선택한 팀의 역할이 아닙니다.", 400);
    }
  }

  const service = createServiceSupabaseClient();
  const { data: roleId, error } = await service.rpc("admin_save_role", {
    p_role_id: input.id ?? null,
    p_team_id: input.teamId,
    p_role_key: normalized.key,
    p_name: normalized.name,
    p_description: normalized.description,
    p_permission_keys: normalized.permissions,
    p_actor_email: bootstrap.identity.email,
  });
  if (error && isIdentitySchemaUnavailable(error)) {
    throw new AdminApiError("V32 역할·권한 마이그레이션이 필요합니다.", 503);
  }
  if (error?.code === "23505") {
    throw new AdminApiError("팀에서 이미 사용 중인 역할 키입니다.", 409);
  }
  if (error) throw error;

  await writeAdminAudit({
    actorEmail: bootstrap.identity.email,
    action: input.id ? "role.updated" : "role.created",
    teamId: input.teamId,
    targetType: "role",
    targetId: String(roleId),
    targetLabel: normalized.name,
    beforeState: before,
    afterState: normalized,
  });
  return { id: String(roleId) };
}

export async function deleteRole(roleId: string) {
  const role = await loadRoleForMutation(roleId);
  if (role.is_system) {
    throw new AdminApiError("시스템 역할은 삭제할 수 없습니다.", 409);
  }
  if (!role.team_id) {
    throw new AdminApiError("역할의 팀 정보를 확인할 수 없습니다.", 409);
  }
  const bootstrap = await requireAdminSession(role.team_id, "roles.manage");
  const service = createServiceSupabaseClient();
  const { error } = await service.rpc("admin_delete_role", {
    p_role_id: roleId,
  });
  if (error?.code === "23503") {
    throw new AdminApiError(
      "구성원에게 배정된 역할은 삭제할 수 없습니다.",
      409,
    );
  }
  if (error && isIdentitySchemaUnavailable(error)) {
    throw new AdminApiError("V32 역할·권한 마이그레이션이 필요합니다.", 503);
  }
  if (error) throw error;

  await writeAdminAudit({
    actorEmail: bootstrap.identity.email,
    action: "role.deleted",
    teamId: role.team_id,
    targetType: "role",
    targetId: role.id,
    targetLabel: role.name,
    beforeState: role,
  });
}
