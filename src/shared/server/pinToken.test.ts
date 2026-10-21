import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueVerifyToken, validateVerifyToken } from "./pinToken";

/** totp_secrets 조회만 흉내 내는 최소 클라이언트 — 현재 시크릿 행 id 를 돌려준다 */
function fakeClient(currentSecretId: number | null): SupabaseClient {
    const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        maybeSingle: async () => ({
            data: currentSecretId === null ? null : { id: currentSecretId },
            error: null,
        }),
    };
    return { from: () => query } as unknown as SupabaseClient;
}

describe("TOTP verify token", () => {
    beforeEach(() => {
        vi.stubEnv("PIN_TOKEN_SECRET", "test-secret");
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.useRealTimers();
    });

    it("발급한 시크릿 행이 그대로면 유효하다", async () => {
        const token = issueVerifyToken("team-a", "profile-1", 7);
        await expect(
            validateVerifyToken(fakeClient(7), "team-a", token, "profile-1"),
        ).resolves.toBe(true);
    });

    it("TOTP 초기화로 시크릿 행이 사라지거나 바뀌면 무효다", async () => {
        const token = issueVerifyToken("team-a", "profile-1", 7);
        await expect(
            validateVerifyToken(fakeClient(null), "team-a", token, "profile-1"),
        ).resolves.toBe(false);
        await expect(
            validateVerifyToken(fakeClient(8), "team-a", token, "profile-1"),
        ).resolves.toBe(false);
    });

    it("다른 팀·사용자이거나 시크릿 id 를 바꾸면 무효다", async () => {
        const token = issueVerifyToken("team-a", "profile-1", 7);
        const [ts, , hmac] = token.split(".");
        await expect(
            validateVerifyToken(fakeClient(7), "team-b", token, "profile-1"),
        ).resolves.toBe(false);
        await expect(
            validateVerifyToken(fakeClient(7), "team-a", token, "profile-2"),
        ).resolves.toBe(false);
        await expect(
            validateVerifyToken(fakeClient(9), "team-a", `${ts}.9.${hmac}`, "profile-1"),
        ).resolves.toBe(false);
    });

    it("5분이 지나면 무효다", async () => {
        vi.useFakeTimers();
        const token = issueVerifyToken("team-a", "profile-1", 7);
        vi.advanceTimersByTime(5 * 60 * 1000 + 1);
        await expect(
            validateVerifyToken(fakeClient(7), "team-a", token, "profile-1"),
        ).resolves.toBe(false);
    });

    it("예전 형식(ts.hmac) 토큰은 무효다", async () => {
        await expect(
            validateVerifyToken(fakeClient(7), "team-a", "123.abc", "profile-1"),
        ).resolves.toBe(false);
    });
});
