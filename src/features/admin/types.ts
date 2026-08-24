export type AdminRole = "admin" | "member" | "guest";
export type MemberStatus = "active" | "pending" | "suspended" | "rejected";
export type AdminScopeKind = "organization" | "team";

export type AdminScope = {
  kind: AdminScopeKind;
  teamId: string | null;
  label: string;
};

export type AdminIdentity = {
  email: string;
  name: string;
  avatarUrl: string | null;
  isOrganizationAdmin: boolean;
};

export type AdminTeam = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  memberCount: number;
  adminCount: number;
  projectCount: number;
};

export type AdminMember = {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  teamId: string | null;
  teamName: string;
  role: AdminRole;
  status: MemberStatus;
  level: number | null;
  exp: number | null;
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
