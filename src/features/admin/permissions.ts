import type { AdminPermission, AdminRole, MemberStatus } from "./types";

export const ADMIN_PERMISSION_DEFINITIONS = [
  { key: "admin.read", name: "관리자 영역 조회", category: "운영" },
  { key: "requests.review", name: "접근 요청 검토", category: "구성원" },
  { key: "members.read", name: "구성원 조회", category: "구성원" },
  { key: "members.manage", name: "구성원 관리", category: "구성원" },
  { key: "teams.read", name: "팀 조회", category: "팀" },
  { key: "teams.manage", name: "팀 관리", category: "팀" },
  { key: "roles.read", name: "역할·권한 조회", category: "보안" },
  { key: "roles.manage", name: "역할·권한 관리", category: "보안" },
  { key: "audit.read", name: "감사 로그 조회", category: "보안" },
  { key: "integrations.read", name: "연동 조회", category: "연동" },
  { key: "integrations.manage", name: "연동 관리", category: "연동" },
] as const satisfies readonly {
  key: AdminPermission;
  name: string;
  category: string;
}[];

export const ALL_ADMIN_PERMISSIONS = ADMIN_PERMISSION_DEFINITIONS.map(
  (permission) => permission.key,
);

const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  admin: [
    ...ALL_ADMIN_PERMISSIONS,
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

export function normalizeAdminPermission(value: unknown) {
  return ALL_ADMIN_PERMISSIONS.find((permission) => permission === value);
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
