import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 권한 판정 회귀 테스트.
 *
 * getServerUserRole 은 모든 서버 라우트의 접근 제어 근거이므로,
 * 여기서 role 이 잘못 나오면 인가 자체가 깨진다.
 * 특히 "정규화 신원(profiles/team_memberships) 우선, 없으면 players 폴백"
 * 분기는 V31 백필이 끝나지 않은 환경에서 기존 사용자를 잠그지 않기 위한
 * 호환 장치이므로 반드시 유지되어야 한다.
 */

const { mockGetUser, mockMaybeSingle, mockLoadNormalizedIdentity } = vi.hoisted(
    () => ({
        mockGetUser: vi.fn(),
        mockMaybeSingle: vi.fn(),
        mockLoadNormalizedIdentity: vi.fn(),
    }),
);

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
    mockMaybeSingle.mockResolvedValue({ data: null });
    mockLoadNormalizedIdentity.mockResolvedValue(null);
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

    // 회귀: V31 백필이 지연되어 profiles 는 생겼지만 team_memberships 가
    // 아직 없는 사용자가 모든 팀 접근을 잃던 문제.
    it("프로필만 있고 멤버십이 비어 있으면 players 로 폴백한다", async () => {
        signedInAs("member@example.com");
        mockLoadNormalizedIdentity.mockResolvedValue(profileWith("active", []));
        mockMaybeSingle.mockResolvedValue({
            data: { name: "member", role: "admin", status: "active" },
        });

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBe("admin");
    });

    it("정규화 스키마가 없으면 players 로 폴백한다", async () => {
        signedInAs("member@example.com");
        mockLoadNormalizedIdentity.mockResolvedValue(null);
        mockMaybeSingle.mockResolvedValue({
            data: { name: "member", role: "member", status: "active" },
        });

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBe("member");
    });

    it("players 폴백에서도 비활성 계정은 권한이 없다", async () => {
        signedInAs("member@example.com");
        mockLoadNormalizedIdentity.mockResolvedValue(null);
        mockMaybeSingle.mockResolvedValue({
            data: { name: "member", role: "admin", status: "pending" },
        });

        const { role } = await getServerUserRole(TEAM);

        expect(role).toBeNull();
    });
});
