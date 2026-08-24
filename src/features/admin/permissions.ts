import type { AdminRole, MemberStatus } from "./types";

export type AdminPermission =
  | "admin.read"
  | "requests.review"
  | "members.manage"
  | "teams.manage"
  | "roles.manage"
  | "audit.read"
  | "integrations.manage";

const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  admin: [
    "admin.read",
    "requests.review",
    "members.manage",
    "teams.manage",
    "roles.manage",
    "audit.read",
    "integrations.manage",
  ],
  member: [],
  guest: [],
};

export function hasAdminPermission(
  role: AdminRole | null,
  permission: AdminPermission,
) {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

export function isActiveAdmin(
  role: string | null | undefined,
  status: string | null | undefined,
) {
  return role === "admin" && status === "active";
}

export function normalizeAdminRole(value: unknown): AdminRole {
  return value === "admin" || value === "guest" ? value : "member";
}

export function normalizeMemberStatus(value: unknown): MemberStatus {
  if (value === "pending" || value === "suspended" || value === "rejected") {
    return value;
  }
  return "active";
}
