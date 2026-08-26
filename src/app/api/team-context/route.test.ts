import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 팀 컨텍스트 회귀 테스트.
 *
 * 이 라우트가 반환하는 teamId·role·modules 가 클라이언트 전체의 권한과
 * 화면 구성을 결정한다. 403 조건이 느슨해지면 소속되지 않은 팀 데이터가
 * 노출되고, 반대로 과하게 막으면 정상 사용자가 로그인 직후 튕긴다.
 */

const { mockGetServerUser, mockLoadNormalizedIdentity, tableData } = vi.hoisted(
    () => ({
        mockGetServerUser: vi.fn(),
        mockLoadNormalizedIdentity: vi.fn(),
        tableData: {
            value: {} as Record<string, { data?: unknown; error?: unknown }>,
        },
    }),
);

function makeClient() {
    return {
        from(table: string) {
            const result = tableData.value[table] ?? { data: [], error: null };
            const chain: Record<string, unknown> = {
                select: () => chain,
                eq: () => chain,
                in: () => chain,
                order: () => chain,
                maybeSingle: async () => result,
                then: (
                    resolve: (v: unknown) => unknown,
                    reject?: (e: unknown) => unknown,
                ) => Promise.resolve(result).then(resolve, reject),
            };
            return chain;
        },
    };
}

vi.mock("@/infrastructure/supabase/server", () => ({
    getServerUser: () => mockGetServerUser(),
}));

vi.mock("@/features/identity/server/identityRepository", () => ({
    loadNormalizedIdentity: (...args: unknown[]) =>
        mockLoadNormalizedIdentity(...args),
    isIdentitySchemaUnavailable: () => false,
}));

import { GET, PUT } from "./route";

const EMAIL = "member@example.com";

function getRequest(cookieTeamId?: string) {
    const req = new NextRequest("https://example.com/api/team-context");
    if (cookieTeamId) req.cookies.set("current_team_id", cookieTeamId);
    return req;
}

function putRequest(teamId: unknown) {
    return new NextRequest("https://example.com/api/team-context", {
        method: "PUT",
        body: JSON.stringify({ teamId }),
        headers: { "Content-Type": "application/json" },
    });
}

function identity(
    accountStatus: string,
    memberships: Array<{
        teamId: string;
        status: string;
        role: string;
        isDefault: boolean;
    }>,
) {
    return {
        profile: {
            id: "p1",
            email: EMAIL,
            accountStatus,
            displayName: "구성원",
            avatarUrl: null,
        },
        memberships,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({
        supabase: makeClient(),
        user: { id: "auth-1", email: EMAIL },
    });
    mockLoadNormalizedIdentity.mockResolvedValue(
        identity("active", [
            { teamId: "ud2", status: "active", role: "admin", isDefault: true },
        ]),
    );
    tableData.value = {
        teams: { data: [{ id: "ud2", name: "UD2팀", status: "active" }] },
        players: {
            data: [{ id: 4, name: "구성원", email: EMAIL, avatar_url: null }],
        },
        team_modules: {
            data: [
                { module: "tasks", enabled: true },
                { module: "report", enabled: true },
                { module: "manage", enabled: false },
            ],
        },
    };
});

describe("GET /api/team-context", () => {
    it("로그인하지 않았으면 401", async () => {
        mockGetServerUser.mockResolvedValue({
            supabase: makeClient(),
            user: null,
        });

        expect((await GET(getRequest())).status).toBe(401);
    });

    it("활성 프로필이 없으면 403", async () => {
        mockLoadNormalizedIdentity.mockResolvedValue(
            identity("suspended", [
                { teamId: "ud2", status: "active", role: "admin", isDefault: true },
            ]),
        );

        const res = await GET(getRequest());

        expect(res.status).toBe(403);
        expect((await res.json()).message).toBe("No active profile");
    });

    it("활성 멤버십이 없으면 403", async () => {
        mockLoadNormalizedIdentity.mockResolvedValue(
            identity("active", [
                {
                    teamId: "ud2",
                    status: "suspended",
                    role: "admin",
                    isDefault: true,
                },
            ]),
        );

        const res = await GET(getRequest());

        expect(res.status).toBe(403);
        expect((await res.json()).message).toBe("No active team membership");
    });

    it("소속 팀이 모두 비활성이면 403", async () => {
        tableData.value.teams = {
            data: [{ id: "ud2", name: "UD2팀", status: "archived" }],
        };

        const res = await GET(getRequest());

        expect(res.status).toBe(403);
        expect((await res.json()).message).toBe("No active team");
    });

    it("정상 요청이면 팀 컨텍스트와 활성 모듈을 반환한다", async () => {
        const res = await GET(getRequest());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.teamId).toBe("ud2");
        expect(body.role).toBe("admin");
        expect(body.member).toBe("구성원");
        expect(body.modules).toEqual(["tasks", "report"]);
    });

    // 회귀: team_modules 를 아직 적용하지 않은 환경에서 모든 기능이
    // 비활성으로 보이면 안 된다.
    it("team_modules 가 비어 있으면 전체 모듈로 폴백한다", async () => {
        tableData.value.team_modules = { data: [] };

        const body = await (await GET(getRequest())).json();

        expect(body.modules).toEqual([
            "tasks",
            "report",
            "gamification",
            "agent",
            "manage",
        ]);
    });
});

describe("PUT /api/team-context", () => {
    it("teamId 가 없으면 400", async () => {
        expect((await PUT(putRequest(""))).status).toBe(400);
    });

    it("소속되지 않은 팀으로 전환하면 403", async () => {
        const res = await PUT(putRequest("other-team"));

        expect(res.status).toBe(403);
        expect((await res.json()).message).toBe("Not a member of this team");
    });

    // 회귀: 활성 멤버십은 있지만 팀 자체가 비활성인 경우, 조용히 다른 팀으로
    // 대체되어 200 을 돌려주던 문제. 요청한 팀이 아니면 거부해야 한다.
    it("비활성 팀으로 명시적으로 전환하면 403", async () => {
        mockLoadNormalizedIdentity.mockResolvedValue(
            identity("active", [
                { teamId: "ud2", status: "active", role: "admin", isDefault: true },
                {
                    teamId: "archived-team",
                    status: "active",
                    role: "member",
                    isDefault: false,
                },
            ]),
        );
        tableData.value.teams = {
            data: [
                { id: "ud2", name: "UD2팀", status: "active" },
                { id: "archived-team", name: "보관팀", status: "archived" },
            ],
        };

        const res = await PUT(putRequest("archived-team"));

        expect(res.status).toBe(403);
        expect((await res.json()).message).toBe("Not a member of this team");
    });

    it("소속된 활성 팀으로 전환하면 200", async () => {
        const res = await PUT(putRequest("ud2"));

        expect(res.status).toBe(200);
        expect((await res.json()).teamId).toBe("ud2");
    });
});
