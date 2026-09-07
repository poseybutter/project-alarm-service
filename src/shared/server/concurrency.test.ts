import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "./concurrency";

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
    it("뒤 항목이 먼저 끝나도 결과는 입력 순서대로 돌려준다", async () => {
        const delays = [30, 20, 10, 0];
        const results = await mapWithConcurrency(
            delays,
            4,
            async (ms, index) => {
                await sleep(ms);
                return `item-${index}`;
            },
        );
        expect(results).toEqual(["item-0", "item-1", "item-2", "item-3"]);
    });

    it("동시 실행 수가 한도를 넘지 않는다", async () => {
        let active = 0;
        let maxActive = 0;
        await mapWithConcurrency(Array.from({ length: 10 }), 3, async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await sleep(1);
            active -= 1;
        });
        expect(maxActive).toBe(3);
    });

    it("빈 배열이면 아무것도 실행하지 않고 빈 결과를 돌려준다", async () => {
        const fnCalls: unknown[] = [];
        const results = await mapWithConcurrency([], 4, async (item) => {
            fnCalls.push(item);
            return item;
        });
        expect(results).toEqual([]);
        expect(fnCalls).toEqual([]);
    });

    it("실패하면 전체를 거부하고 새 항목은 시작하지 않는다", async () => {
        const started: number[] = [];
        await expect(
            mapWithConcurrency([0, 1, 2, 3], 1, async (_, index) => {
                started.push(index);
                await sleep(0);
                if (index === 1) throw new Error("boom");
            }),
        ).rejects.toThrow("boom");
        // 순차 루프가 첫 실패에서 멈추는 것과 같아야 한다.
        expect(started).toEqual([0, 1]);
    });

    it("한도가 1 미만이거나 정수가 아니면 거부한다", async () => {
        await expect(
            mapWithConcurrency([1], 0, async () => null),
        ).rejects.toThrow();
        await expect(
            mapWithConcurrency([1], 1.5, async () => null),
        ).rejects.toThrow();
    });
});
