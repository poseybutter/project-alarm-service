import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    env[key] = value.replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

async function rows(client, table, columns) {
  const { data, error } = await client.from(table).select(columns);
  if (error) throw error;
  return data ?? [];
}

const env = loadLocalEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase environment variables are not configured.");
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const [permissions, roles, rolePermissions, memberships] = await Promise.all([
  rows(supabase, "permissions", "key"),
  rows(supabase, "roles", "id,team_id,role_key,is_system,status"),
  rows(supabase, "role_permissions", "role_id,permission_key"),
  rows(supabase, "team_memberships", "team_id,role_id"),
]);

const roleById = new Map(roles.map((role) => [role.id, role]));
const systemRoleKeys = new Set(
  roles
    .filter(
      (role) =>
        role.team_id === null && role.is_system && role.status === "active",
    )
    .map((role) => role.role_key),
);
const teamAdmin = roles.find(
  (role) => role.team_id === null && role.role_key === "team_admin",
);
const teamAdminPermissions = new Set(
  rolePermissions
    .filter((permission) => permission.role_id === teamAdmin?.id)
    .map((permission) => permission.permission_key),
);

const audit = {
  membership_without_role: memberships.filter(
    (membership) => membership.role_id === null,
  ).length,
  membership_with_archived_role: memberships.filter((membership) => {
    const role = roleById.get(membership.role_id);
    return role && role.status !== "active";
  }).length,
  membership_with_foreign_team_role: memberships.filter((membership) => {
    const role = roleById.get(membership.role_id);
    return role?.team_id && role.team_id !== membership.team_id;
  }).length,
  missing_system_role: ["team_admin", "team_member", "team_viewer"].filter(
    (roleKey) => !systemRoleKeys.has(roleKey),
  ).length,
  team_admin_missing_permission: permissions.filter(
    (permission) => !teamAdminPermissions.has(permission.key),
  ).length,
};

console.log(
  JSON.stringify(
    {
      counts: {
        permissions: permissions.length,
        roles: roles.length,
        role_permissions: rolePermissions.length,
        memberships: memberships.length,
      },
      audit,
    },
    null,
    2,
  ),
);

if (Object.values(audit).some((count) => count !== 0)) {
  process.exitCode = 1;
}
