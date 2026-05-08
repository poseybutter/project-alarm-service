import type { Project } from "./types";

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

export function getDiff(dateStr: string | null) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const n = new Date();
    d.setHours(0, 0, 0, 0);
    n.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - n.getTime()) / (1000 * 60 * 60 * 24));
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
