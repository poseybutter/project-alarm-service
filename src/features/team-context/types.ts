export type TeamContextOption = {
    id: string;
    name: string;
    role: "admin" | "member" | "viewer";
    isDefault: boolean;
};

export type TeamMemberOption = {
    id: number;
    name: string;
};

export type TeamContextResponse = {
    teamId: string;
    teams: TeamContextOption[];
    members: string[];
    memberOptions: TeamMemberOption[];
    member: string;
    playerId: number | null;
    avatarUrl: string | null;
    role: "admin" | "member" | "viewer" | "guest";
};
