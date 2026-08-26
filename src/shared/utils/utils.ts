import type { Project } from "@/lib/types";

/** Supabase 행을 Project 타입으로 정규화 (members / 레거시 member 호환) */
export function normalizeProject(row: Record<string, unknown>): Project {
    const raw = row.members;
    const members =
        Array.isArray(raw) && raw.length > 0
            ? raw.filter((x): x is string => typeof x === "string")
            : typeof row.member === "string" && row.member
              ? [row.member]
              : [];
    /* language는 DB에 "PHP, JSP" 형태 문자열로만 저장 — 별도 변환 없이 그대로 사용 */
    const language = (row.language as string) || null;
    return {
        ...row,
        members,
        language,
    } as Project;
}

export function getProjectMembers(p: Project): string[] {
    if (p.members && p.members.length > 0) return p.members;
    if (p.member) return [p.member];
    return [];
}

export function findTeamMemberId(
    members: readonly { id: number; name: string }[],
    name: string | null | undefined,
) {
    if (!name) return null;
    return members.find((member) => member.name === name)?.id ?? null;
}

export function findProjectId(
    projects: readonly Pick<Project, "id" | "name">[],
    name: string | null | undefined,
) {
    if (!name) return null;
    return projects.find((project) => project.name === name)?.id ?? null;
}

export function getDiff(dateStr: string | null) {
    if (!dateStr) return null;
    // "YYYY-MM-DD" 문자열을 로컬 날짜로 파싱 (UTC 변환 없이 D-day 계산)
    const [y, m, d] = dateStr.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** 작성 시점 기준 상대 시간 (방금/몇 분/시간/일 전, 7일 이상은 날짜). 실제 일시는 GitHub에 있음 */
export function timeAgo(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    // "일" 단위는 자정 기준 날짜 차이로 계산 (6/8 → 6/10 = 2일 전)
    const startOfDay = (d: Date) => {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x.getTime();
    };
    const dayDiff = Math.round(
        (startOfDay(now) - startOfDay(date)) / 86400000,
    );
    if (dayDiff <= 0) {
        // 같은 날(또는 미래/시계 오차): 경과 시간으로 표시
        const sec = Math.floor((now.getTime() - date.getTime()) / 1000);
        if (sec < 60) return "방금 전";
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}분 전`;
        return `${Math.floor(min / 60)}시간 전`;
    }
    if (dayDiff < 7) return `${dayDiff}일 전`;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export function formatWorkload(min: number) {
    if (!min) return "";
    if (min < 60) return `${min}분`;
    if (min < 480) return `${(min / 60).toFixed(1).replace(".0", "")}h`;

    const days = Math.floor(min / 480);
    const remaining = min % 480;

    if (remaining === 0) return `${days}일`;
    if (remaining < 60) return `${days}일 ${remaining}분`;
    return `${days}일 ${(remaining / 60).toFixed(1).replace(".0", "")}h`;
}
