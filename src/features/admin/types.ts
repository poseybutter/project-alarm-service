export type AdminRole = "admin" | "member" | "viewer" | "guest";
export type MemberStatus = "active" | "pending" | "suspended" | "rejected";
export type AdminScopeKind = "organization" | "team";
export type AdminPermission =
  | "admin.read"
  | "requests.review"
  | "members.read"
  | "members.manage"
  | "teams.read"
  | "teams.manage"
  | "roles.read"
  | "roles.manage"
  | "audit.read"
  | "integrations.read"
  | "integrations.manage";

export type AdminScope = {
  kind: AdminScopeKind;
  teamId: string | null;
  label: string;
  permissions: AdminPermission[];
};

export type AdminIdentity = {
  email: string;
  name: string;
  avatarUrl: string | null;
  isOrganizationAdmin: boolean;
};

export type TeamModuleKey = "tasks" | "report" | "gamification" | "agent" | "manage";

export const TEAM_MODULE_LABELS: Record<TeamModuleKey, string> = {
  tasks: "업무 관리",
  report: "브리핑·리포트",
  gamification: "게이미피케이션",
  agent: "알림 에이전트",
  manage: "프로젝트·접근성 관리",
};

export const ALL_TEAM_MODULES: TeamModuleKey[] = [
  "tasks",
  "report",
  "gamification",
  "agent",
  "manage",
];

export type AdminTeam = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  memberCount: number;
  adminCount: number;
  projectCount: number;
  modules: TeamModuleKey[];
};

export type AdminMember = {
  id: number;
  membershipId: string | null;
  isDefault: boolean;
  name: string;
  email: string;
  avatarUrl: string | null;
  teamId: string | null;
  teamName: string;
  role: AdminRole;
  status: MemberStatus;
  level: number | null;
  exp: number | null;
  roleId: string | null;
  roleKey: string;
  roleName: string;
};

export type AdminPermissionDefinition = {
  key: AdminPermission;
  name: string;
  description: string | null;
  category: string;
  riskLevel: "normal" | "sensitive" | "critical";
};

export type AdminRoleDefinition = {
  id: string;
  teamId: string | null;
  teamName: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  status: "active" | "archived";
  permissions: AdminPermission[];
  memberCount: number;
};

export type AdminRoleCatalog = {
  schemaReady: boolean;
  permissions: AdminPermissionDefinition[];
  roles: AdminRoleDefinition[];
};

export type AccessRequest = AdminMember & {
  requestedAt: string | null;
};

export type AdminActivity = {
  id: string;
  action: string;
  actorEmail: string;
  targetLabel: string;
  createdAt: string;
};

export type AdminDashboard = {
  generatedAt: string;
  totals: {
    members: number;
    pendingRequests: number;
    suspendedMembers: number;
    activeProjects: number;
    openTasks: number;
  };
  teams: AdminTeam[];
  recentActivity: AdminActivity[];
};

export type AdminBootstrap = {
  identity: AdminIdentity;
  scopes: AdminScope[];
  currentScope: AdminScope;
};

export type ApiFailure = {
  message: string;
  requestId?: string;
};
