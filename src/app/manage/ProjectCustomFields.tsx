"use client";

import { useCallback, useState } from "react";
import type { FieldDef, FieldValue } from "./useProjectFields";

const isSafeUrl = (url: string) => /^https?:\/\//i.test(url);

type Props = {
    projectId: number;
    defs: FieldDef[];
    values: FieldValue[];
    isGuest: boolean;
    onSave: (
        projectId: number,
        fields: { field_def_id: number; value: string | null }[],
    ) => Promise<void>;
    onReveal: (projectId: number, fieldDefId: number) => Promise<string>;
};

function fieldTypeIcon(type: string) {
    if (type === "secret") return "ri-lock-line";
    if (type === "url") return "ri-link";
    if (type === "textarea") return "ri-file-text-line";
    if (type === "select") return "ri-list-check-2";
    return "ri-text";
}

export default function ProjectCustomFields({
    projectId,
    defs,
    values,
    isGuest,
    onSave,
    onReveal,
}: Props) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState<Record<number, string>>({});
    const [revealed, setRevealed] = useState<Record<number, string>>({});
    const [revealing, setRevealing] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);

    const sorted = [...defs].sort((a, b) => a.sort_order - b.sort_order);
    const valueMap = new Map(values.map((v) => [v.field_def_id, v]));

    const startEdit = useCallback(() => {
        const initial: Record<number, string> = {};
        for (const def of defs) {
            const val = valueMap.get(def.id);
            initial[def.id] =
                def.field_type === "secret"
                    ? "" // secret 편집 시 빈 값으로 시작 (변경할 때만 입력)
                    : val?.value ?? "";
        }
        setForm(initial);
        setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defs, values]);

    const cancelEdit = useCallback(() => {
        setEditing(false);
        setForm({});
    }, []);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            const fields = defs
                .map((def) => ({
                    field_def_id: def.id,
                    value: form[def.id]?.trim() || null,
                }))
                .filter((f) => {
                    // secret 필드는 빈 문자열이면 변경하지 않음
                    const def = defs.find((d) => d.id === f.field_def_id);
                    if (def?.field_type === "secret" && !f.value) return false;
                    return true;
                });
            if (fields.length > 0) {
                await onSave(projectId, fields);
            }
            setEditing(false);
            setForm({});
            setRevealed({});
        } finally {
            setSaving(false);
        }
    }, [defs, form, projectId, onSave]);

    const handleReveal = useCallback(
        async (fieldDefId: number) => {
            setRevealing(fieldDefId);
            try {
                const value = await onReveal(projectId, fieldDefId);
                setRevealed((prev) => ({ ...prev, [fieldDefId]: value }));
            } catch {
                // 복호화 실패
            } finally {
                setRevealing(null);
            }
        },
        [projectId, onReveal],
    );

    const hideRevealed = useCallback((fieldDefId: number) => {
        setRevealed((prev) => {
            const next = { ...prev };
            delete next[fieldDefId];
            return next;
        });
    }, []);

    if (sorted.length === 0) return null;

    // 읽기 모드
    if (!editing) {
        const hasAnyValue = sorted.some((def) => {
            const val = valueMap.get(def.id);
            return val?.value || val?.has_secret;
        });

        return (
            <div className="mt-2 pt-2 border-t border-stone-100">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wide">
                        커스텀 필드
                    </span>
                    {!isGuest && (
                        <button
                            type="button"
                            onClick={startEdit}
                            className="text-[10px] text-amber-500 font-medium hover:text-amber-600"
                        >
                            편집
                        </button>
                    )}
                </div>
                {!hasAnyValue ? (
                    <p className="text-[10px] text-stone-300 py-1">
                        등록된 값이 없습니다
                    </p>
                ) : (
                    <div className="space-y-1">
                        {sorted.map((def) => {
                            const val = valueMap.get(def.id);
                            if (!val?.value && !val?.has_secret) return null;

                            return (
                                <div key={def.id} className="flex items-start gap-2">
                                    <span className="text-xs text-stone-400 w-20 shrink-0 flex items-center gap-1">
                                        <i
                                            className={`${fieldTypeIcon(def.field_type)} text-[10px]`}
                                            aria-hidden
                                        />
                                        {def.label}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        {def.field_type === "secret" ? (
                                            <div className="flex items-center gap-1.5">
                                                {revealed[def.id] ? (
                                                    <>
                                                        <span className="text-xs text-stone-600 font-mono break-all">
                                                            {revealed[def.id]}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                hideRevealed(def.id)
                                                            }
                                                            className="text-[10px] text-stone-400 shrink-0"
                                                        >
                                                            숨기기
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="text-xs text-stone-400 tracking-widest">
                                                            ●●●●●●
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                void handleReveal(def.id)
                                                            }
                                                            disabled={
                                                                revealing === def.id
                                                            }
                                                            className="text-[10px] text-amber-500 font-medium shrink-0 disabled:opacity-50"
                                                        >
                                                            {revealing === def.id
                                                                ? "..."
                                                                : "보기"}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        ) : def.field_type === "url" && val.value ? (
                                            isSafeUrl(val.value) ? (
                                                <a
                                                    href={val.value}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-blue-500 underline truncate block"
                                                >
                                                    {val.value}
                                                </a>
                                            ) : (
                                                <span className="text-xs text-stone-600 truncate block">
                                                    {val.value}
                                                </span>
                                            )
                                        ) : (
                                            <span className="text-xs text-stone-600 leading-relaxed whitespace-pre-wrap">
                                                {val.value}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // 편집 모드
    return (
        <div className="mt-2 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wide">
                    커스텀 필드 편집
                </span>
            </div>
            <div className="space-y-2.5">
                {sorted.map((def) => {
                    const val = valueMap.get(def.id);
                    return (
                        <div key={def.id}>
                            <label className="text-xs font-medium text-stone-500 mb-1 flex items-center gap-1">
                                <i
                                    className={`${fieldTypeIcon(def.field_type)} text-[10px]`}
                                    aria-hidden
                                />
                                {def.label}
                                {def.field_type === "secret" && (
                                    <span className="text-[10px] text-stone-300 font-normal">
                                        (빈칸이면 유지)
                                    </span>
                                )}
                            </label>
                            {def.field_type === "textarea" ? (
                                <textarea
                                    className="w-full border border-stone-200 rounded-lg px-2.5 py-2 text-xs min-h-[3rem] resize-y"
                                    value={form[def.id] ?? ""}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            [def.id]: e.target.value,
                                        }))
                                    }
                                />
                            ) : def.field_type === "select" && def.options ? (
                                <select
                                    className="w-full border border-stone-200 rounded-lg px-2.5 py-2 text-xs"
                                    value={form[def.id] ?? ""}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            [def.id]: e.target.value,
                                        }))
                                    }
                                >
                                    <option value="">선택</option>
                                    {def.options.map((opt) => (
                                        <option key={opt} value={opt}>
                                            {opt}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    className="w-full border border-stone-200 rounded-lg px-2.5 py-2 text-xs"
                                    type={def.field_type === "secret" ? "password" : "text"}
                                    placeholder={
                                        def.field_type === "secret"
                                            ? val?.has_secret
                                                ? "변경할 값 입력 (빈칸이면 기존 값 유지)"
                                                : "값 입력"
                                            : def.field_type === "url"
                                              ? "https://"
                                              : ""
                                    }
                                    value={form[def.id] ?? ""}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            [def.id]: e.target.value,
                                        }))
                                    }
                                />
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex gap-2 mt-3">
                <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex-1 bg-amber-500 text-white text-xs font-medium py-2.5 rounded-lg disabled:opacity-50"
                >
                    {saving ? "저장 중..." : "저장"}
                </button>
                <button
                    type="button"
                    onClick={cancelEdit}
                    className="flex-1 border border-stone-200 text-xs font-medium py-2.5 rounded-lg text-stone-500"
                >
                    취소
                </button>
            </div>
        </div>
    );
}
