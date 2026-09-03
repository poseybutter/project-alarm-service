import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 구성원 순서 변경 페이로드 회귀 테스트.
 *
 * 이 엔드포인트가 받은 order 배열은 그대로 sort_order 로 저장돼 업무·리포트 등
 * 팀 전체 화면의 구성원 표시 순서를 결정한다. 검증이 느슨해지면 중복 순번이나
 * 일부 구성원만 담긴 목록이 저장돼 순서가 깨지고, 감사 로그에는 성공으로 남는다.
 * (구성원 전체 일치 여부는 DB RPC 가 함께 검증한다 — V49)
 */

const { mockReorderTeamMembers } = vi.hoisted(() => ({
    mockReorderTeamMembers: vi.fn(),
}));

class FakeAdminApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly requestId = "test-request-id",
    ) {
        super(message);
    }
}

vi.mock("@/features/admin/server/adminRepository", () => ({
    AdminApiError: FakeAdminApiError,
    addTeamMembership: vi.fn(),
    listAdminMembers: vi.fn(),
    removeTeamMembership: vi.fn(),
    updateAdminMember: vi.fn(),
    reorderTeamMembers: (input: unknown) => mockReorderTeamMembers(input),
}));

const { PATCH } = await import("./route");

function reorderRequest(body: unknown) {
    return new NextRequest("http://localhost/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_B = "22222222-2222-4222-8222-222222222222";

describe("PATCH /api/admin/members — reorder", () => {
    beforeEach(() => {
        mockReorderTeamMembers.mockReset();
        mockReorderTeamMembers.mockResolvedValue(undefined);
    });

    it("정상 페이로드를 저장소로 전달한다", async () => {
        const response = await PATCH(
            reorderRequest({
                action: "reorder",
                teamId: "team-a",
                order: [
                    { membershipId: MEMBER_A, playerId: 7, sortOrder: 0 },
                    { membershipId: MEMBER_B, playerId: 0, sortOrder: 1 },
                ],
            }),
        );

        expect(response.status).toBe(200);
        expect(mockReorderTeamMembers).toHaveBeenCalledWith({
            teamId: "team-a",
            order: [
                { membershipId: MEMBER_A, playerId: 7, sortOrder: 0 },
                { membershipId: MEMBER_B, playerId: 0, sortOrder: 1 },
            ],
        });
    });

    const rejected: [string, unknown][] = [
        ["빈 배열", []],
        ["배열이 아닌 order", { nope: true }],
        [
            "중복 membershipId",
            [
                { membershipId: MEMBER_A, playerId: 0, sortOrder: 0 },
                { membershipId: MEMBER_A, playerId: 0, sortOrder: 1 },
            ],
        ],
        [
            "중복 playerId",
            [
                { membershipId: "", playerId: 7, sortOrder: 0 },
                { membershipId: "", playerId: 7, sortOrder: 1 },
            ],
        ],
        [
            "중복 sortOrder",
            [
                { membershipId: MEMBER_A, playerId: 0, sortOrder: 0 },
                { membershipId: MEMBER_B, playerId: 0, sortOrder: 0 },
            ],
        ],
        [
            "음수 sortOrder",
            [{ membershipId: MEMBER_A, playerId: 0, sortOrder: -1 }],
        ],
        [
            "정수가 아닌 sortOrder",
            [{ membershipId: MEMBER_A, playerId: 0, sortOrder: 1.5 }],
        ],
        [
            "길이를 벗어난 sortOrder (0..n-1 순열 아님)",
            [{ membershipId: MEMBER_A, playerId: 0, sortOrder: 3 }],
        ],
        [
            "식별자 없는 항목",
            [{ membershipId: "", playerId: 0, sortOrder: 0 }],
        ],
        ["객체가 아닌 항목", [null]],
    ];

    it.each(rejected)("%s 요청을 400으로 거부한다", async (_label, order) => {
        const response = await PATCH(
            reorderRequest({ action: "reorder", teamId: "team-a", order }),
        );

        expect(response.status).toBe(400);
        expect(mockReorderTeamMembers).not.toHaveBeenCalled();
    });

    it("teamId 가 없으면 400으로 거부한다", async () => {
        const response = await PATCH(
            reorderRequest({
                action: "reorder",
                teamId: "   ",
                order: [{ membershipId: MEMBER_A, playerId: 0, sortOrder: 0 }],
            }),
        );

        expect(response.status).toBe(400);
        expect(mockReorderTeamMembers).not.toHaveBeenCalled();
    });

    it("저장소가 올린 AdminApiError 상태 코드를 그대로 응답한다", async () => {
        mockReorderTeamMembers.mockRejectedValue(
            new FakeAdminApiError("순서 목록이 팀의 활성 구성원 전체와 일치하지 않습니다.", 400),
        );

        const response = await PATCH(
            reorderRequest({
                action: "reorder",
                teamId: "team-a",
                order: [{ membershipId: MEMBER_A, playerId: 0, sortOrder: 0 }],
            }),
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            message: "순서 목록이 팀의 활성 구성원 전체와 일치하지 않습니다.",
        });
    });
});
