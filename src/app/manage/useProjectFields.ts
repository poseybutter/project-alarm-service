"use client";

import { useCallback, useMemo } from "react";

export type FieldDef = {
    id: number;
    team_id: string;
    project_id: number;
    name: string;
    label: string;
    field_type: "text" | "url" | "secret" | "textarea" | "select";
    sort_order: number;
    is_required: boolean;
    options: string[] | null;
    created_at: string;
    updated_at: string;
};

export type FieldValue = {
    id: number;
    project_id: number;
    field_def_id: number;
    value: string | null;
    has_secret: boolean;
    updated_at: string;
};

export type HistoryItem = {
    id: number;
    project_id: number;
    field_def_id: number;
    field_label: string;
    old_value: string | null;
    new_value: string | null;
    is_secret: boolean;
    action: string;
    changed_by: string;
    changed_at: string;
};

// ── 기본 필드 정의 ──────────────────────────
// 접속 정보 (운영/로컬 × 4필드 = 8개)
// 개발 환경 (6개)

type DefaultFieldSpec = {
    name: string;
    label: string;
    field_type: FieldDef["field_type"];
    sort_order: number;
    /** 어느 섹션에 속하는지 (UI 렌더링용) */
    section: "access" | "dev";
};

export const ACCESS_FIELD_KEYS = [
    "homepage", "admin_url", "admin_id", "admin_pw",
] as const;

export const ACCESS_LABELS: Record<string, string> = {
    homepage: "홈페이지",
    admin_url: "관리자 URL",
    admin_id: "관리자 ID",
    admin_pw: "관리자 PW",
};

export const DEV_FIELDS: DefaultFieldSpec[] = [
    { name: "dev_ide", label: "IDE", field_type: "select", sort_order: 100, section: "dev" },
    { name: "dev_project_path", label: "프로젝트 경로", field_type: "text", sort_order: 101, section: "dev" },
    { name: "dev_vcs", label: "형상관리", field_type: "select", sort_order: 102, section: "dev" },
    { name: "dev_vcs_url", label: "저장소 URL", field_type: "textarea", sort_order: 103, section: "dev" },
    { name: "dev_jdk", label: "JDK/JRE", field_type: "text", sort_order: 104, section: "dev" },
    { name: "dev_tomcat", label: "Tomcat", field_type: "text", sort_order: 105, section: "dev" },
];

function buildDefaultFields(): DefaultFieldSpec[] {
    const fields: DefaultFieldSpec[] = [];
    let order = 0;
    for (const env of ["prod", "local"] as const) {
        for (const key of ACCESS_FIELD_KEYS) {
            const isSecret = key === "admin_id" || key === "admin_pw";
            fields.push({
                name: `access_${env}_${key}`,
                label: `${ACCESS_LABELS[key]}`,
                field_type: isSecret ? "secret" : key === "homepage" || key === "admin_url" ? "url" : "text",
                sort_order: order++,
                section: "access",
            });
        }
    }
    for (const dev of DEV_FIELDS) {
        fields.push({ ...dev, section: "dev" });
    }
    return fields;
}

export const DEFAULT_FIELD_SPECS = buildDefaultFields();

/** 접속 정보/개발 환경 필드 이름인지 판별 */
export function isSystemField(name: string) {
    return name.startsWith("access_") || name.startsWith("dev_");
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
            (body as { message?: string }).message ?? `HTTP ${res.status}`,
        );
    }
    return res.json() as Promise<T>;
}

/** 프로젝트별 커스텀 필드 API 호출 유틸 */
export function useProjectFields(teamId: string | null) {

    const loadDefs = useCallback(
        async (projectId: number): Promise<FieldDef[]> => {
            if (!teamId) return [];
            return api<FieldDef[]>(
                `/api/project-fields/definitions?teamId=${encodeURIComponent(teamId)}&projectId=${projectId}`,
            );
        },
        [teamId],
    );

    const loadValues = useCallback(
        async (projectId: number): Promise<FieldValue[]> => {
            if (!teamId) return [];
            return api<FieldValue[]>(
                `/api/project-fields/values?teamId=${encodeURIComponent(teamId)}&projectId=${projectId}`,
            );
        },
        [teamId],
    );

    /** 기본 필드가 아직 없으면 자동 생성, 최종 defs 반환 */
    const ensureDefaultFields = useCallback(
        async (projectId: number): Promise<FieldDef[]> => {
            if (!teamId) return [];
            const existing = await loadDefs(projectId);
            const existingNames = new Set(existing.map((d) => d.name));
            const missing = DEFAULT_FIELD_SPECS.filter(
                (spec) => !existingNames.has(spec.name),
            );
            if (missing.length > 0) {
                await Promise.all(
                    missing.map((spec) =>
                        api("/api/project-fields/definitions", {
                            method: "POST",
                            body: JSON.stringify({
                                teamId,
                                projectId,
                                name: spec.name,
                                label: spec.label,
                                field_type: spec.field_type,
                                sort_order: spec.sort_order,
                            }),
                        }),
                    ),
                );
                return loadDefs(projectId);
            }
            return existing;
        },
        [teamId, loadDefs],
    );

    const addDef = useCallback(
        async (projectId: number, label: string, fieldType: string, name?: string) => {
            if (!teamId) return;
            await api("/api/project-fields/definitions", {
                method: "POST",
                body: JSON.stringify({ teamId, projectId, label, field_type: fieldType, ...(name ? { name } : {}) }),
            });
        },
        [teamId],
    );

    const updateDef = useCallback(
        async (id: number, patch: Partial<FieldDef>) => {
            if (!teamId) return;
            await api("/api/project-fields/definitions", {
                method: "PATCH",
                body: JSON.stringify({ teamId, id, ...patch }),
            });
        },
        [teamId],
    );

    const deleteDef = useCallback(
        async (id: number) => {
            if (!teamId) return;
            await api("/api/project-fields/definitions", {
                method: "DELETE",
                body: JSON.stringify({ teamId, id }),
            });
        },
        [teamId],
    );

    const reorderDefs = useCallback(
        async (reorder: { id: number; sort_order: number }[]) => {
            if (!teamId) return;
            await api("/api/project-fields/definitions", {
                method: "PATCH",
                body: JSON.stringify({ teamId, reorder }),
            });
        },
        [teamId],
    );

    const saveValues = useCallback(
        async (
            projectId: number,
            fields: { field_def_id: number; value: string | null }[],
        ) => {
            if (!teamId) return;
            await api("/api/project-fields/values", {
                method: "PUT",
                body: JSON.stringify({ teamId, projectId, fields }),
            });
        },
        [teamId],
    );

    const revealSecret = useCallback(
        async (projectId: number, fieldDefId: number, pin?: string): Promise<string> => {
            if (!teamId) throw new Error("No team");
            const res = await api<{ value: string }>(
                "/api/project-fields/secrets/reveal",
                {
                    method: "POST",
                    body: JSON.stringify({ teamId, projectId, fieldDefId, pin }),
                },
            );
            return res.value;
        },
        [teamId],
    );

    const loadHistory = useCallback(
        async (
            projectId: number,
            cursor?: number | null,
        ): Promise<{ items: HistoryItem[]; nextCursor: number | null }> => {
            if (!teamId) return { items: [], nextCursor: null };
            let url = `/api/project-fields/history?teamId=${encodeURIComponent(teamId)}&projectId=${projectId}`;
            if (cursor) url += `&cursor=${cursor}`;
            return api(url);
        },
        [teamId],
    );

    const setPin = useCallback(
        async (pin: string | null) => {
            if (!teamId) return;
            await api("/api/project-fields/pin", {
                method: "POST",
                body: JSON.stringify({ teamId, pin }),
            });
        },
        [teamId],
    );

    const verifyPin = useCallback(
        async (pin: string): Promise<boolean> => {
            if (!teamId) return false;
            const res = await api<{ ok: boolean }>(
                "/api/project-fields/pin/verify",
                {
                    method: "POST",
                    body: JSON.stringify({ teamId, pin }),
                },
            );
            return res.ok;
        },
        [teamId],
    );

    const checkHasPin = useCallback(
        async (): Promise<boolean> => {
            if (!teamId) return false;
            const res = await api<{ hasPin: boolean }>(
                `/api/project-fields/pin?teamId=${encodeURIComponent(teamId)}`,
            );
            return res.hasPin;
        },
        [teamId],
    );

    return useMemo(() => ({
        loadDefs,
        loadValues,
        ensureDefaultFields,
        addDef,
        updateDef,
        deleteDef,
        reorderDefs,
        saveValues,
        revealSecret,
        loadHistory,
        setPin,
        verifyPin,
        checkHasPin,
    }), [
        loadDefs,
        loadValues,
        ensureDefaultFields,
        addDef,
        updateDef,
        deleteDef,
        reorderDefs,
        saveValues,
        revealSecret,
        loadHistory,
        setPin,
        verifyPin,
        checkHasPin,
    ]);
}
