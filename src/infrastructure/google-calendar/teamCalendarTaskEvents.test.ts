import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { TeamCalendarTaskInput } from "./index";
import { syncTeamCalendarTaskEvents } from "./index";

/**
 * 업무 내용 항목별 팀 캘린더 일정 동기화 규칙을 고정한다.
 *
 * - 자체 일정이 있는 항목 → 그 기간으로 항목별 일정
 * - 일정 없는 항목 → 업무 기간 일정 하나에 모아서
 * - content_items 가 없는 기존 업무 → 예전처럼 업무 기간 일정 하나
 */

type Call = { method: string; url: string; body: Record<string, unknown> | null };
let calls: Call[] = [];

/** PUT/POST 는 성공, DELETE 는 204 로 응답하는 Google Calendar 스텁 */
function stubGoogle(overrides: (call: Call) => { status: number; json?: unknown } | null = () => null) {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
        const call: Call = {
            method: init.method ?? "GET",
            url,
            body: init.body ? JSON.parse(init.body as string) : null,
        };
        calls.push(call);
        const o = overrides(call);
        if (o) return new Response(JSON.stringify(o.json ?? {}), { status: o.status });
        if (call.method === "DELETE") return new Response(null, { status: 204 });
        const id = decodeURIComponent(url.split("/events/")[1] ?? "") || "generated-id";
        return new Response(JSON.stringify({ id, htmlLink: `link/${id}` }), { status: 200 });
    }));
}

const BASE: TeamCalendarTaskInput = {
    id: 270,
    member: "이지은",
    proj: "중부대학교 IR센터",
    content: "킥오프 회의\n디자인 작업\n콘텐츠 게시판 생성",
    start_date: "2026-08-05",
    end_date: "2026-08-31",
};

const run = (task: TeamCalendarTaskInput) =>
    syncTeamCalendarTaskEvents({ accessToken: "t", calendarId: "cal@group", task });

const writes = () => calls.filter((c) => c.method === "PUT" || c.method === "POST");
const deletes = () => calls.filter((c) => c.method === "DELETE");

beforeEach(() => { calls = []; stubGoogle(); });
afterEach(() => vi.unstubAllGlobals());

describe("업무 내용 항목별 캘린더 일정", () => {
    it("content_items 가 없으면 업무 기간 일정 하나만 만든다", async () => {
        const r = await run(BASE);
        expect(writes()).toHaveLength(1);
        expect(writes()[0].body?.summary).toBe("[이지은] 중부대학교 IR센터 - 킥오프 회의\n디자인 작업\n콘텐츠 게시판 생성");
        expect(writes()[0].body?.start).toEqual({ date: "2026-08-05" });
        expect(r.itemEventIds).toEqual([]);
        expect(r.baseEventId).toBeTruthy();
    });

    it("일정 있는 항목은 그 기간으로, 없는 항목은 업무 기간 일정에 모은다", async () => {
        const r = await run({
            ...BASE,
            content_items: [
                { text: "킥오프 회의", workload: 60, start_date: "2026-08-05", end_date: "2026-08-05" },
                { text: "디자인 작업", workload: 120, start_date: "2026-08-10", end_date: "2026-08-21" },
                { text: "콘텐츠 게시판 생성", workload: 30 },
                { text: "고객 피드백 대기", workload: 0 },
            ],
        });
        expect(writes()).toHaveLength(3);

        const base = writes()[0];
        expect(base.body?.summary).toBe("[이지은] 중부대학교 IR센터 - 콘텐츠 게시판 생성\n고객 피드백 대기");
        expect(base.body?.start).toEqual({ date: "2026-08-05" });
        expect(base.body?.end).toEqual({ date: "2026-09-01" }); // 종일 일정 end 는 +1일

        expect(writes()[1].body?.summary).toBe("[이지은] 중부대학교 IR센터 - 킥오프 회의");
        expect(writes()[1].body?.start).toEqual({ date: "2026-08-05" });
        expect(writes()[2].body?.summary).toBe("[이지은] 중부대학교 IR센터 - 디자인 작업");
        expect(writes()[2].body?.start).toEqual({ date: "2026-08-10" });
        expect(r.itemEventIds).toHaveLength(2);
    });

    it("항목 일정 ID 는 업무 기간 일정 ID 와 겹치지 않는다", async () => {
        const r = await run({
            ...BASE,
            content_items: [
                { text: "킥오프", workload: 0, start_date: "2026-08-05", end_date: "2026-08-05" },
                { text: "일정 없음", workload: 0 },
            ],
        });
        expect(r.itemEventIds).not.toContain(r.baseEventId);
        expect(new Set(r.itemEventIds).size).toBe(r.itemEventIds.length);
    });

    it("모든 항목에 일정이 있으면 업무 기간 일정은 지운다", async () => {
        const r = await run({
            ...BASE,
            team_calendar_event_id: "old-base",
            content_items: [
                { text: "킥오프", workload: 0, start_date: "2026-08-05", end_date: "2026-08-05" },
            ],
        });
        expect(r.baseEventId).toBeNull();
        expect(deletes().some((d) => d.url.includes("old-base"))).toBe(true);
        expect(r.itemEventIds).toHaveLength(1);
    });

    it("항목이 줄면 남는 항목 일정을 지운다", async () => {
        await run({
            ...BASE,
            team_calendar_item_event_ids: ["item-a", "item-b", "item-c"],
            content_items: [
                { text: "킥오프", workload: 0, start_date: "2026-08-05", end_date: "2026-08-05" },
                { text: "일정 없음", workload: 0 },
            ],
        });
        const deletedIds = deletes().map((d) => decodeURIComponent(d.url.split("/events/")[1]));
        expect(deletedIds).toContain("item-b");
        expect(deletedIds).toContain("item-c");
        expect(deletedIds).not.toContain("item-a");
    });

    it("기존 항목 일정 ID 가 있으면 그대로 갱신한다", async () => {
        await run({
            ...BASE,
            team_calendar_item_event_ids: ["item-a"],
            content_items: [
                { text: "킥오프", workload: 0, start_date: "2026-08-05", end_date: "2026-08-05" },
                { text: "일정 없음", workload: 0 },
            ],
        });
        expect(writes().some((w) => w.url.includes("item-a"))).toBe(true);
    });

    it("지워진 일정(410)은 새로 만든다", async () => {
        let gone = true;
        stubGoogle((call) => {
            if (call.method === "PUT" && gone) { gone = false; return { status: 410, json: { error: { message: "Gone" } } }; }
            return null;
        });
        const r = await run(BASE);
        expect(calls.some((c) => c.method === "POST")).toBe(true);
        expect(r.baseEventId).toBeTruthy();
    });

    it("표시할 내용이 없으면 사용자에게 알릴 오류를 던진다", async () => {
        await expect(run({ ...BASE, content: "", content_items: [] })).rejects.toThrow(
            "팀 캘린더에 표시할 업무 내용이 없습니다",
        );
    });
});
