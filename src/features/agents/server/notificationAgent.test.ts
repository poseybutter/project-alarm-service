import { describe, it, expect } from "vitest";
import type { Task } from "@/shared/types";
import { buildNotificationSuggestions } from "./notificationAgent";

/**
 * 모닝 기상나팔 업무 내용 표기 회귀 테스트.
 *
 * 이전 구현은 task.content(항목을 줄바꿈으로 병합한 평문)만 읽어서, 업무 내용을
 * content_items 로 개별 등록하고 항목별 상태를 지정해도 알림에는 상태가 빠졌다.
 * 항목 하나가 완료돼도 기상나팔에서는 남은 일과 구분되지 않았다.
 */

const BASE: Task = {
    id: 1,
    team_id: "t1",
    member: "홍길동",
    type: "프로젝트",
    proj: "메인 개편",
    content: "메인 슬라이드 개편\n리브리핑 정리\n검수 대응",
    content_items: null,
    status: "진행중",
    progress: 0,
    workload: 210,
    start_date: null,
    end_date: "2026-09-03",
    priority: null,
    issue: null,
    is_plan: false,
    is_starred: false,
} as Task;

function build(task: Task) {
    const [suggestion] = buildNotificationSuggestions({
        teamId: "t1",
        tasks: [task],
        createdBy: null,
        now: new Date("2026-09-03T00:00:00+09:00"),
    });
    const payload = suggestion.payload as { text: string; card: { sections: Array<{ widgets: Array<{ textParagraph: { text: string } }> }> } };
    return {
        text: payload.text,
        card: payload.card.sections.flatMap((s) => s.widgets.map((w) => w.textParagraph.text)).join("\n"),
    };
}

describe("모닝 기상나팔 업무 내용", () => {
    const withItems: Task = {
        ...BASE,
        content_items: [
            { text: "메인 슬라이드 개편", workload: 120, status: "완료" },
            { text: "리브리핑 정리", workload: 60, status: "진행중" },
            { text: "검수 대응", workload: 30 },
        ],
    };

    it("완료한 항목을 상태와 함께 표기한다", () => {
        const { text, card } = build(withItems);
        expect(text).toContain("• 메인 슬라이드 개편 (완료)");
        expect(card).toContain("<s>메인 슬라이드 개편</s>");
        expect(card).toContain('<font color="#16a34a">완료</font>');
    });

    it("항목마다 자기 상태를 쓰고, 상태 없는 항목은 그대로 둔다", () => {
        const { text, card } = build(withItems);
        expect(text).toContain("• 리브리핑 정리 (진행중)");
        expect(text).toContain("• 검수 대응\n");
        expect(card).toContain("• 검수 대응<br>");
        expect(card).not.toContain("<s>검수 대응</s>");
    });

    it("빈 항목은 건너뛴다", () => {
        const { text } = build({
            ...BASE,
            content_items: [
                { text: "   ", workload: 0 },
                { text: "실제 항목", workload: 10, status: "완료" },
            ],
        });
        expect(text).toContain("• 실제 항목 (완료)");
        expect(text).not.toMatch(/• {3}\n/);
    });

    it("content_items 가 없는 기존 업무는 content 줄을 그대로 쓴다", () => {
        const { text } = build(BASE);
        expect(text).toContain("• 메인 슬라이드 개편");
        expect(text).toContain("• 검수 대응");
        expect(text).not.toContain("(완료)");
    });
});
