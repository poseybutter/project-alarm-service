import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 팀 캘린더 재동기화 라우트 회귀 테스트.
 *
 * 동시 처리(SYNC_CONCURRENCY) 도입 후에도 순차 처리 때의 동작이 그대로여야 한다:
 * - 응답 형태와 errors 순서(업무 id 오름차순)
 * - 캘린더에서 뺀 업무(show_on_team_calendar=false)를 되살리지 않는 것
 * - 업무별 성공/부분 실패 기록(고아 일정 방지)과 이전 캘린더 정리 순서
 * - limit/cursor 배치 이어받기
 * 여기에 새 보장 두 가지: 동시 호출이 한도를 넘지 않고, 스킵 기록은 한 번에 쓴다.
 */

const { mockGetRole, mockGetToken, mockSync, mockDelete } = vi.hoisted(() => ({
    mockGetRole: vi.fn(),
    mockGetToken: vi.fn(),
    mockSync: vi.fn(),
    mockDelete: vi.fn(),
}));

class FakeTeamCalendarSyncError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TeamCalendarSyncError";
    }
}

class FakeTeamCalendarPartialSyncError extends Error {
    constructor(
        readonly reason: unknown,
        readonly progress: { baseEventId: string | null; itemEventIds: string[] },
    ) {
        super(reason instanceof Error ? reason.message : "팀 캘린더 동기화 실패");
        this.name = "TeamCalendarPartialSyncError";
    }
}

type TaskRow = {
    id: number;
    member: string;
    proj: string;
    content: string;
    show_on_team_calendar: boolean;
    team_calendar_event_id?: string | null;
    team_calendar_item_event_ids?: string[] | null;
    team_calendar_id?: string | null;
};

type UpdateLog = {
    table: string;
    payload: Record<string, unknown>;
    filters: Array<{ method: string; column: string; value: unknown }>;
};

type FakeDbConfig = {
    setting?: { calendar_id: string; connection_email: string } | null;
    memberCalendars?: Array<{ member: string; calendar_id: string }>;
    connection?: Record<string, unknown> | null;
    tasks?: TaskRow[];
};

/** 라우트가 쓰는 supabase 체인만 흉내 낸다. update 는 기록만 하고 성공을 돌려준다. */
function createFakeDb(config: FakeDbConfig) {
    const updates: UpdateLog[] = [];
    const sequence: string[] = [];
    const client = {
        from(table: string) {
            const filters: UpdateLog["filters"] = [];
            let op: "select" | "update" = "select";
            let payload: Record<string, unknown> = {};
            let rowLimit = Infinity;

            const runSelect = () => {
                if (table === "agent_member_calendar_settings") {
                    return { data: config.memberCalendars ?? [], error: null };
                }
                if (table === "tasks") {
                    let rows = config.tasks ?? [];
                    for (const filter of filters) {
                        if (filter.column === "team_id") continue;
                        if (filter.method === "eq") {
                            rows = rows.filter(
                                (row) =>
                                    row[filter.column as keyof TaskRow] ===
                                    filter.value,
                            );
                        }
                        if (filter.method === "gt" && filter.column === "id") {
                            rows = rows.filter(
                                (row) => row.id > (filter.value as number),
                            );
                        }
                    }
                    return { data: rows.slice(0, rowLimit), error: null };
                }
                throw new Error(`예상하지 못한 select: ${table}`);
            };

            const runUpdate = () => {
                updates.push({ table, payload, filters });
                const target =
                    filters.find((filter) => filter.column === "id")?.value ??
                    "batch";
                sequence.push(`update:${String(target)}`);
                return { error: null };
            };

            const builder = {
                select: () => builder,
                update: (values: Record<string, unknown>) => {
                    op = "update";
                    payload = values;
                    return builder;
                },
                eq: (column: string, value: unknown) => {
                    filters.push({ method: "eq", column, value });
                    return builder;
                },
                gt: (column: string, value: unknown) => {
                    filters.push({ method: "gt", column, value });
                    return builder;
                },
                in: (column: string, value: unknown) => {
                    filters.push({ method: "in", column, value });
                    return builder;
                },
                order: () => builder,
                limit: (count: number) => {
                    rowLimit = count;
                    return builder;
                },
                maybeSingle: async () => {
                    if (table === "agent_team_calendar_settings") {
                        return { data: config.setting ?? null, error: null };
                    }
                    if (table === "agent_calendar_connections") {
                        return { data: config.connection ?? null, error: null };
                    }
                    throw new Error(`예상하지 못한 maybeSingle: ${table}`);
                },
                then: (
                    onFulfilled: (value: unknown) => unknown,
                    onRejected: (reason: unknown) => unknown,
                ) =>
                    Promise.resolve(
                        op === "update" ? runUpdate() : runSelect(),
                    ).then(onFulfilled, onRejected),
            };
            return builder;
        },
    };
    return { client, updates, sequence };
}

let fakeDb: ReturnType<typeof createFakeDb>;

vi.mock("@/infrastructure/supabase/server", () => ({
    createServiceSupabaseClient: () => fakeDb.client,
    getServerCurrentTeamRole: () => mockGetRole(),
}));

vi.mock("@/infrastructure/google-calendar", () => ({
    deleteTeamCalendarTaskEvent: (...args: unknown[]) => mockDelete(...args),
    getTeamCalendarAccessToken: (...args: unknown[]) => mockGetToken(...args),
    syncTeamCalendarTaskEvents: (...args: unknown[]) => mockSync(...args),
    TeamCalendarSyncError: FakeTeamCalendarSyncError,
    TeamCalendarPartialSyncError: FakeTeamCalendarPartialSyncError,
}));

const { POST } = await import("./route");

const SETTING = { calendar_id: "team-cal", connection_email: "conn@example.com" };
const CONNECTION = {
    member: "포지",
    email: "conn@example.com",
    access_token: "enc",
    refresh_token: "enc",
    expires_at: null,
};
const MEMBER_CALENDARS = [{ member: "포지", calendar_id: "cal-posey" }];

function taskRow(id: number, overrides: Partial<TaskRow> = {}): TaskRow {
    return {
        id,
        member: "포지",
        proj: "P",
        content: `업무 ${id}`,
        show_on_team_calendar: true,
        team_calendar_event_id: null,
        team_calendar_item_event_ids: null,
        team_calendar_id: null,
        ...overrides,
    };
}

function resync(query = "") {
    return POST(
        new Request(
            `http://localhost/api/agents/team-calendar/tasks/resync${query}`,
            { method: "POST" },
        ),
    );
}

describe("POST /api/agents/team-calendar/tasks/resync", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
        mockGetRole.mockReset().mockResolvedValue({
            user: { email: "admin@example.com" },
            role: "admin",
            teamId: "team-1",
        });
        mockGetToken.mockReset().mockResolvedValue("access-token");
        mockDelete.mockReset().mockResolvedValue(undefined);
        mockSync.mockReset().mockImplementation(
            async ({ task }: { task: TaskRow }) => ({
                baseEventId: `ev-${task.id}`,
                itemEventIds: [],
                htmlLink: null,
            }),
        );
        fakeDb = createFakeDb({
            setting: SETTING,
            connection: CONNECTION,
            memberCalendars: MEMBER_CALENDARS,
            tasks: [],
        });
    });

    it("관리자가 아니면 403, 팀 컨텍스트가 없으면 401", async () => {
        mockGetRole.mockResolvedValueOnce({
            user: { email: "member@example.com" },
            role: "member",
            teamId: "team-1",
        });
        expect((await resync()).status).toBe(403);

        mockGetRole.mockResolvedValueOnce({ user: null, role: null, teamId: null });
        expect((await resync()).status).toBe(401);
    });

    it("팀 캘린더 설정이 없으면 400", async () => {
        fakeDb = createFakeDb({ setting: null });
        expect((await resync()).status).toBe(400);
    });

    it("limit 만큼 처리하고 nextCursor 로 이어받는다", async () => {
        const tasks = [taskRow(1), taskRow(2), taskRow(3)];
        fakeDb = createFakeDb({
            setting: SETTING,
            connection: CONNECTION,
            memberCalendars: MEMBER_CALENDARS,
            tasks,
        });

        const first = await (await resync("?limit=2")).json();
        expect(first).toMatchObject({ synced: 2, failed: 0, nextCursor: 2 });

        const second = await (await resync("?limit=2&cursor=2")).json();
        expect(second).toMatchObject({ synced: 1, failed: 0, nextCursor: null });
        expect(mockSync).toHaveBeenCalledTimes(3);
    });

    it("캘린더에서 뺀 업무(show_on_team_calendar=false)는 조회하지 않는다", async () => {
        fakeDb = createFakeDb({
            setting: SETTING,
            connection: CONNECTION,
            memberCalendars: MEMBER_CALENDARS,
            tasks: [taskRow(1), taskRow(2, { show_on_team_calendar: false })],
        });

        const body = await (await resync()).json();
        expect(body).toMatchObject({ synced: 1, skipped: 0, failed: 0 });
        expect(mockSync).toHaveBeenCalledTimes(1);
    });

    it("성공·스킵·실패를 집계하고 errors 는 업무 순서를 유지한다", async () => {
        fakeDb = createFakeDb({
            setting: SETTING,
            connection: CONNECTION,
            memberCalendars: MEMBER_CALENDARS,
            tasks: [
                taskRow(1),
                taskRow(2, { member: "캘린더없는사람" }),
                taskRow(3),
                taskRow(4, { member: "캘린더없는사람" }),
            ],
        });
        mockSync.mockImplementation(async ({ task }: { task: TaskRow }) => {
            if (task.id === 3) {
                throw new FakeTeamCalendarSyncError(
                    "팀 캘린더에 표시하려면 업무 기간 또는 마감일이 필요합니다",
                );
            }
            return { baseEventId: `ev-${task.id}`, itemEventIds: [], htmlLink: null };
        });

        const body = await (await resync()).json();
        expect(body.synced).toBe(1);
        expect(body.skipped).toBe(2);
        expect(body.failed).toBe(3);
        expect(body.errors.map((error: { id: number }) => error.id)).toEqual([
            2, 3, 4,
        ]);

        // 성공 업무는 이벤트 ID 저장 + 오류 삭제
        const success = fakeDb.updates.find((update) =>
            update.filters.some(
                (filter) => filter.column === "id" && filter.value === 1,
            ),
        );
        expect(success?.payload).toMatchObject({
            team_calendar_event_id: "ev-1",
            team_calendar_sync_error: null,
        });

        // 실패 업무는 사용자 메시지를 업무별로 기록
        const failed = fakeDb.updates.find((update) =>
            update.filters.some(
                (filter) => filter.column === "id" && filter.value === 3,
            ),
        );
        expect(failed?.payload.team_calendar_sync_error).toContain("마감일");

        // 스킵 기록은 업무별 갱신 대신 한 번의 .in() 으로 모아 쓴다
        const skippedWrites = fakeDb.updates.filter((update) =>
            update.filters.some((filter) => filter.method === "in"),
        );
        expect(skippedWrites).toHaveLength(1);
        expect(
            skippedWrites[0].filters.find((filter) => filter.method === "in")
                ?.value,
        ).toEqual([2, 4]);
    });

    it("부분 실패 진행분(이벤트 ID)을 저장해 고아 일정을 막는다", async () => {
        fakeDb = createFakeDb({
            setting: SETTING,
            connection: CONNECTION,
            memberCalendars: MEMBER_CALENDARS,
            tasks: [taskRow(1)],
        });
        mockSync.mockRejectedValueOnce(
            new FakeTeamCalendarPartialSyncError(new Error("boom"), {
                baseEventId: "v000001",
                itemEventIds: ["v000001i00"],
            }),
        );

        const body = await (await resync()).json();
        expect(body.failed).toBe(1);
        expect(fakeDb.updates[0].payload).toMatchObject({
            team_calendar_event_id: "v000001",
            team_calendar_item_event_ids: ["v000001i00"],
            team_calendar_sync_error: "팀 캘린더 재동기화 실패",
        });
    });

    it("캘린더가 바뀐 업무는 DB 갱신 뒤에 이전 캘린더 일정을 지운다", async () => {
        fakeDb = createFakeDb({
            setting: SETTING,
            connection: CONNECTION,
            memberCalendars: MEMBER_CALENDARS,
            tasks: [
                taskRow(1, {
                    team_calendar_id: "cal-old",
                    team_calendar_event_id: "e1",
                    team_calendar_item_event_ids: ["e1i00"],
                }),
            ],
        });
        mockDelete.mockImplementation(
            async ({ eventId }: { eventId: string }) => {
                fakeDb.sequence.push(`delete:${eventId}`);
            },
        );

        const body = await (await resync()).json();
        expect(body.synced).toBe(1);

        // 새 캘린더로 갈 때는 저장된 이벤트 ID 를 비워 새로 만든다
        expect(mockSync.mock.calls[0][0].task).toMatchObject({
            team_calendar_event_id: null,
            team_calendar_item_event_ids: null,
        });
        expect(mockDelete).toHaveBeenCalledTimes(2);
        expect(mockDelete.mock.calls.map((call) => call[0])).toEqual([
            expect.objectContaining({ calendarId: "cal-old", eventId: "e1" }),
            expect.objectContaining({ calendarId: "cal-old", eventId: "e1i00" }),
        ]);
        expect(fakeDb.sequence).toEqual([
            "update:1",
            "delete:e1",
            "delete:e1i00",
        ]);
    });

    it("동시 호출은 한도(4)까지만 나가고 그 이상 몰리지 않는다", async () => {
        fakeDb = createFakeDb({
            setting: SETTING,
            connection: CONNECTION,
            memberCalendars: MEMBER_CALENDARS,
            tasks: Array.from({ length: 10 }, (_, index) => taskRow(index + 1)),
        });
        let active = 0;
        let maxActive = 0;
        mockSync.mockImplementation(async ({ task }: { task: TaskRow }) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
            return { baseEventId: `ev-${task.id}`, itemEventIds: [], htmlLink: null };
        });

        const body = await (await resync()).json();
        expect(body.synced).toBe(10);
        expect(maxActive).toBe(4);
    });
});
