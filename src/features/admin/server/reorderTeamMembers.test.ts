import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 구성원 순서 저장 원자성 회귀 테스트.
 *
 * 이전 구현은 멤버 수만큼 개별 update 를 순차 실행하고 감사 로그를 별도 insert 로
 * 남겨, 중간 실패 시 앞쪽 행만 갱신된 채로 남고 클라이언트에는 성공이 보고됐다.
 * V49 admin_reorder_team_members RPC 가 검증·전체 갱신·감사 로그를 한 트랜잭션에서
 * 처리하므로, 이 파일은 그 단일 경로가 유지되는지를 고정한다.
 *
 * 특히 update 루프가 다시 생기면(부분 저장 재발) 아래 "update 를 직접 호출하지
 * 않는다" 테스트가 깨진다.
 */

const { mockGetServerUser, mockRpc, mockFrom, rpcResult } = vi.hoisted(() => ({
    mockGetServerUser: vi.fn(),
    mockRpc: vi.fn(),
    mockFrom: vi.fn(),
    rpcResult: { value: { data: null, error: null } as { data: unknown; error: unknown } },
}));

const TEAM = { id: "t1", name: "팀1", description: null, status: "active" };

function tableResult(table: string) {
    if (table === "teams") return { data: [TEAM], error: null };
    if (table === "organization_admins") return { data: null, error: null };
    return { data: [], error: null };
}

function makeClient() {
    return {
        from(table: string) {
            mockFrom(table);
            const result = tableResult(table);
            const chain: Record<string, unknown> = {
                select: () => chain,
                insert: () => chain,
                update: () => chain,
                delete: () => chain,
                eq: () => chain,
                in: () => chain,
                not: () => chain,
                order: () => chain,
                maybeSingle: async () => result,
                single: async () => result,
                then: (
                    resolve: (v: unknown) => unknown,
                    reject?: (e: unknown) => unknown,
                ) => Promise.resolve(result).then(resolve, reject),
            };
            return chain;
        },
        rpc: (name: string, params: unknown) => {
            mockRpc(name, params);
            return Promise.resolve(rpcResult.value);
        },
    };
}

vi.mock("server-only", () => ({}));

vi.mock("@/infrastructure/supabase/server", () => ({
    getServerUser: () => mockGetServerUser(),
    createServiceSupabaseClient: () => makeClient(),
}));

vi.mock("@/features/identity/server/identityRepository", () => ({
    isIdentitySchemaUnavailable: (error: unknown) =>
        ["42P01", "42703", "PGRST200", "PGRST205"].includes(
            (error as { code?: string })?.code ?? "",
        ),
    loadNormalizedIdentity: async () => ({
        profile: {
            id: "p1",
            displayName: "관리자",
            email: "admin@x.com",
            avatarUrl: null,
            accountStatus: "active",
        },
        memberships: [
            {
                id: "m1",
                legacyPlayerId: 7,
                teamId: "t1",
                role: "admin",
                status: "active",
                isDefault: true,
            },
        ],
    }),
}));

vi.mock("@/features/admin/server/authorizationRepository", () => ({
    loadMembershipAuthorizationIndex: async () => ({
        byMembershipId: new Map(),
        byRoleId: new Map(),
    }),
}));

const { reorderTeamMembers, AdminApiError } = await import("./adminRepository");

const ORDER = [
    { membershipId: "m1", playerId: 7, sortOrder: 0 },
    { membershipId: "m2", playerId: 0, sortOrder: 1 },
];

describe("reorderTeamMembers — 순서 저장 원자성", () => {
    beforeEach(() => {
        mockRpc.mockReset();
        mockFrom.mockReset();
        mockGetServerUser.mockReset();
        mockGetServerUser.mockResolvedValue({
            user: { email: "admin@x.com", user_metadata: {} },
        });
        rpcResult.value = { data: { updated: 2 }, error: null };
    });

    it("단일 RPC 로 위임한다 (멤버 수와 무관하게 1회)", async () => {
        await reorderTeamMembers({ teamId: "t1", order: ORDER });

        expect(mockRpc).toHaveBeenCalledTimes(1);
        expect(mockRpc).toHaveBeenCalledWith("admin_reorder_team_members", {
            p_team_id: "t1",
            p_order: [
                { membership_id: "m1", player_id: 7, sort_order: 0 },
                { membership_id: "m2", player_id: null, sort_order: 1 },
            ],
            p_actor_email: "admin@x.com",
        });
    });

    it("team_memberships·players 를 직접 update 하지 않는다 (부분 저장 경로 차단)", async () => {
        await reorderTeamMembers({ teamId: "t1", order: ORDER });

        const touched = mockFrom.mock.calls.map(([t]) => t);
        expect(touched).not.toContain("team_memberships");
        expect(touched).not.toContain("players");
    });

    it("감사 로그를 별도 insert 로 남기지 않는다 (RPC 트랜잭션에 포함)", async () => {
        await reorderTeamMembers({ teamId: "t1", order: ORDER });

        expect(mockFrom.mock.calls.map(([t]) => t)).not.toContain(
            "admin_audit_logs",
        );
    });

    it("RPC 검증 실패(22023)를 400 으로 변환한다", async () => {
        rpcResult.value = {
            data: null,
            error: {
                code: "22023",
                message: "순서 목록이 팀의 활성 구성원 전체와 일치하지 않습니다.",
            },
        };

        await expect(
            reorderTeamMembers({ teamId: "t1", order: ORDER }),
        ).rejects.toMatchObject({
            status: 400,
            message: "순서 목록이 팀의 활성 구성원 전체와 일치하지 않습니다.",
        });
    });

    it("V49 미적용(42883)은 폴백 없이 503 으로 실패한다", async () => {
        rpcResult.value = {
            data: null,
            error: { code: "42883", message: "function does not exist" },
        };

        const failure = await reorderTeamMembers({
            teamId: "t1",
            order: ORDER,
        }).catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(AdminApiError);
        expect((failure as InstanceType<typeof AdminApiError>).status).toBe(503);
        // 부분 저장을 유발하던 루프로 조용히 되돌아가지 않아야 한다
        expect(mockFrom.mock.calls.map(([t]) => t)).not.toContain(
            "team_memberships",
        );
    });

    it("그 밖의 DB 오류는 그대로 전파한다", async () => {
        rpcResult.value = {
            data: null,
            error: { code: "40001", message: "serialization failure" },
        };

        await expect(
            reorderTeamMembers({ teamId: "t1", order: ORDER }),
        ).rejects.toMatchObject({ code: "40001" });
    });
});
