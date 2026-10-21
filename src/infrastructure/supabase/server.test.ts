import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 권한 판정 회귀 테스트.
 *
 * getServerUserRole 은 모든 서버 라우트의 접근 제어 근거이므로,
 * 여기서 role 이 잘못 나오면 인가 자체가 깨진다.
 * V31 정규화 스키마(profiles/team_memberships)가 유일한 신원 소스이며,
 * players 폴백은 제거되었다.
 */

const {
    mockGetUser,
    mockMaybeSingle,
    mockLoadNormalizedIdentity,
    mockTeamsIn,
} = vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockMaybeSingle: vi.fn(),
    mockLoadNormalizedIdentity: vi.fn(),
    mockTeamsIn: vi.fn(),
}));

// 팀 상태(teams.status) 조회는 service role 클라이언트로 한다
vi.mock("@supabase/supabase-js", () => ({
    createClient: () => ({
        from: () => ({
            select: () => ({ in: mockTeamsIn }),
        }),
    }),
}));

vi.mock("next/headers", () => ({
    cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({
        auth: { getUser: mockGetUser },
        from: () => {
            const chain = {
                select: () => chain,
                eq: () => chain,
                maybeSingle: mockMaybeSingle,
            };
            return chain;
        },
    }),
}));

vi.mock("@/features/identity/server/identityRepository", () => ({
    loadNormalizedIdentity: (...args: unknown[]) =>
        mockLoadNormalizedIdentity(...args),
    isIdentitySchemaUnavailable: () => false,
}));

import { getServerUserRole } from "@/infrastructure/supabase/server";

const TEAM = "ud2";

function signedInAs(email: string | null) {
    mockGetUser.mockResolvedValue({
        data: { user: email ? { id: "auth-1", email } : null },
        error: email ? null : new Error("no session"),
    });
}

function profileWith(
    accountStatus: string,
    memberships: Array<{ teamId: string; status: string; role: string }>,
) {
    return {
        profile: { id: "p1", email: "member@example.com", accountStatus },
        memberships,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    mockMaybeSingle.mockResolvedValue({ data: null });
    mockLoadNormalizedIdentity.mockResolvedValue(null);
    mockTeamsIn.mockImplementation(async (_column: string, ids: string[]) => ({
        data: ids.map((id) => ({ id, status: "active" })),
        error: null,
    }));
});

describe("getServerUserRole", () => {
    it("로그인하지 않았으면 role 이 없다", async () => {
        signedInAs(null);

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBeNull();
    });

    it("활성 멤버십이 있으면 그 팀에서의 역할을 반환한다", async () => {
        signedInAs("member@example.com");
        mockLoadNormalizedIdentity.mockResolvedValue(
            profileWith("active", [
                { teamId: TEAM, status: "active", role: "admin" },
            ]),
        );

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBe("admin");
    });

    it("보관(archived)된 팀이면 활성 멤버십이어도 권한이 없다", async () => {
        signedInAs("member@example.com");
        mockLoadNormalizedIdentity.mockResolvedValue(
            profileWith("active", [
                { teamId: TEAM, status: "active", role: "admin" },
            ]),
        );
        mockTeamsIn.mockResolvedValue({
            data: [{ id: TEAM, status: "archived" }],
            error: null,
        });

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBeNull();
    });

    it("팀 상태 조회가 실패하면 권한이 없다 (fail-closed)", async () => {
        signedInAs("member@example.com");
        mockLoadNormalizedIdentity.mockResolvedValue(
            profileWith("active", [
                { teamId: TEAM, status: "active", role: "admin" },
            ]),
        );
        mockTeamsIn.mockResolvedValue({
            data: null,
            error: { code: "500", message: "boom" },
        });

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBeNull();
    });

    it("다른 팀 멤버십만 있으면 해당 팀 권한이 없다", async () => {
        signedInAs("member@example.com");
        mockLoadNormalizedIdentity.mockResolvedValue(
            profileWith("active", [
                { teamId: "other-team", status: "active", role: "admin" },
            ]),
        );

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBeNull();
    });

    it("계정이 비활성이면 멤버십이 활성이어도 권한이 없다", async () => {
        signedInAs("member@example.com");
        mockLoadNormalizedIdentity.mockResolvedValue(
            profileWith("suspended", [
                { teamId: TEAM, status: "active", role: "admin" },
            ]),
        );

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBeNull();
    });

    it("멤버십이 정지 상태면 권한이 없다", async () => {
        signedInAs("member@example.com");
        mockLoadNormalizedIdentity.mockResolvedValue(
            profileWith("active", [
                { teamId: TEAM, status: "suspended", role: "admin" },
            ]),
        );

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBeNull();
    });

    it("프로필만 있고 멤버십이 비어 있으면 권한이 없다", async () => {
        signedInAs("member@example.com");
        mockLoadNormalizedIdentity.mockResolvedValue(profileWith("active", []));

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBeNull();
    });

    it("정규화 스키마에서 프로필을 찾지 못하면 권한이 없다", async () => {
        signedInAs("member@example.com");
        mockLoadNormalizedIdentity.mockResolvedValue(null);

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBeNull();
    });
});
