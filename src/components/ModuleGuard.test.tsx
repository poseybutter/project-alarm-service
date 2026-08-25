import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ModuleKey } from "@/features/team-context/types";

/**
 * 모듈 게이팅 회귀 테스트.
 *
 * Nav 에서 탭을 숨기는 것만으로는 부족하고, URL 직접 접근도 막혀야 한다.
 * ModuleGuard 가 그 마지막 방어선이므로 통과 조건이 느슨해지면
 * 비활성 모듈이 그대로 노출된다.
 */

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));

vi.mock("./AuthProvider", () => ({ useAuth: () => mockUseAuth() }));

vi.mock("next/link", () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

import ModuleGuard from "./ModuleGuard";

function authState(modules: ModuleKey[], loading = false) {
    mockUseAuth.mockReturnValue({ loading, modules: new Set(modules) });
}

function renderGuard(module: ModuleKey) {
    return render(
        <ModuleGuard module={module}>
            <p>보호된 내용</p>
        </ModuleGuard>,
    );
}

describe("ModuleGuard", () => {
    it("활성 모듈이면 자식을 렌더링한다", () => {
        authState(["tasks", "report"]);

        renderGuard("tasks");

        expect(screen.getByText("보호된 내용")).toBeInTheDocument();
    });

    it("비활성 모듈이면 자식을 렌더링하지 않는다", () => {
        authState(["report"]);

        renderGuard("tasks");

        expect(screen.queryByText("보호된 내용")).not.toBeInTheDocument();
        expect(screen.getByText("비활성화된 기능입니다")).toBeInTheDocument();
    });

    it("모듈이 하나도 없으면 모두 차단한다", () => {
        authState([]);

        renderGuard("manage");

        expect(screen.queryByText("보호된 내용")).not.toBeInTheDocument();
    });

    // 회귀: 팀 컨텍스트 로딩 중에는 modules 가 비어 있을 수 있다.
    // 이때 차단 화면을 먼저 보여주면 정상 사용자에게 오탐이 노출된다.
    it("로딩 중에는 차단 화면도 자식도 보여주지 않는다", () => {
        authState([], true);

        const { container } = renderGuard("tasks");

        expect(screen.queryByText("보호된 내용")).not.toBeInTheDocument();
        expect(screen.queryByText("비활성화된 기능입니다")).not.toBeInTheDocument();
        expect(container).toBeEmptyDOMElement();
    });
});
