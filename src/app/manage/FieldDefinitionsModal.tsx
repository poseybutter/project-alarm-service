"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldDef } from "./useProjectFields";

// NOTE: 'select' 타입은 옵션 목록 편집 UI 가 아직 없으므로 생성 화면에서 제외.
// 기존에 만들어진 select 필드는 렌더링·저장에 문제 없음.
const FIELD_TYPES = [
    { value: "text", label: "텍스트" },
    { value: "url", label: "URL" },
    { value: "secret", label: "비밀번호" },
    { value: "textarea", label: "메모" },
] as const;

function fieldTypeLabel(type: string) {
    return FIELD_TYPES.find((t) => t.value === type)?.label ?? type;
}

function fieldTypeIcon(type: string) {
    if (type === "secret") return "ri-lock-line";
    if (type === "url") return "ri-link";
    if (type === "textarea") return "ri-file-text-line";
    if (type === "select") return "ri-list-check-2";
    return "ri-text";
}

type Props = {
    defs: FieldDef[];
    onAdd: (label: string, fieldType: string) => Promise<void>;
    onUpdate: (id: number, patch: Partial<FieldDef>) => Promise<void>;
    onDelete: (id: number) => Promise<void>;
    onReorder: (reorder: { id: number; sort_order: number }[]) => Promise<void>;
    onClose: () => void;
};

export default function FieldDefinitionsModal({
    defs,
    onAdd,
    onUpdate,
    onDelete,
    onReorder,
    onClose,
}: Props) {
    const [newLabel, setNewLabel] = useState("");
    const [newType, setNewType] = useState("text");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editType, setEditType] = useState("");
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

    // 드래그 앤 드롭
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleDragStart = useCallback((_: React.DragEvent, idx: number) => {
        dragItem.current = idx;
    }, []);

    const handleDragOver = useCallback(
        (e: React.DragEvent, idx: number) => {
            e.preventDefault();
            dragOverItem.current = idx;
        },
        [],
    );

    const handleDrop = useCallback(async () => {
        if (
            dragItem.current === null ||
            dragOverItem.current === null ||
            dragItem.current === dragOverItem.current
        )
            return;

        const sorted = [...defs].sort((a, b) => a.sort_order - b.sort_order);
        const [moved] = sorted.splice(dragItem.current, 1);
        sorted.splice(dragOverItem.current, 0, moved);

        const reorder = sorted.map((d, i) => ({ id: d.id, sort_order: i }));
        dragItem.current = null;
        dragOverItem.current = null;
        try {
            await onReorder(reorder);
        } catch {
            // 순서 변경 실패 시 조용히 무시 — 다음 로드에서 복원됨
        }
    }, [defs, onReorder]);

    const handleAdd = useCallback(async () => {
        const label = newLabel.trim();
        if (!label) return;
        setSaving(true);
        try {
            await onAdd(label, newType);
            setNewLabel("");
            setNewType("text");
        } finally {
            setSaving(false);
        }
    }, [newLabel, newType, onAdd]);

    const startEdit = useCallback((def: FieldDef) => {
        setEditingId(def.id);
        setEditLabel(def.label);
        setEditType(def.field_type);
    }, []);

    const handleSaveEdit = useCallback(async () => {
        if (editingId === null) return;
        const label = editLabel.trim();
        if (!label) return;
        setSaving(true);
        try {
            await onUpdate(editingId, { label, field_type: editType as FieldDef["field_type"] });
            setEditingId(null);
        } finally {
            setSaving(false);
        }
    }, [editingId, editLabel, editType, onUpdate]);

    const handleDelete = useCallback(
        async (id: number) => {
            setSaving(true);
            try {
                await onDelete(id);
                setDeleteConfirm(null);
            } finally {
                setSaving(false);
            }
        },
        [onDelete],
    );

    const sorted = [...defs].sort((a, b) => a.sort_order - b.sort_order);

    // Escape 키로 모달 닫기
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            style={{ marginBottom: "var(--nav-height)" }}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="커스텀 필드 관리"
        >
            <div
                className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-base font-bold">커스텀 필드 관리</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-2xl text-stone-400 leading-none"
                        aria-label="닫기"
                    >
                        ×
                    </button>
                </div>

                <p className="text-xs text-stone-400 mb-4">
                    드래그하여 순서를 변경할 수 있습니다. 비밀번호 타입은 암호화되어 저장됩니다.
                </p>

                {/* 기존 필드 목록 */}
                <div className="space-y-1.5 mb-5">
                    {sorted.length === 0 && (
                        <p className="text-xs text-stone-400 text-center py-6">
                            아직 커스텀 필드가 없습니다. 아래에서 추가해 주세요.
                        </p>
                    )}
                    {sorted.map((def, idx) => (
                        <div
                            key={def.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, idx)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDrop={handleDrop}
                            className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2.5 cursor-grab active:cursor-grabbing hover:border-amber-300 transition-colors"
                        >
                            <i className="ri-draggable text-stone-300 shrink-0" aria-hidden />

                            {editingId === def.id ? (
                                <>
                                    <input
                                        className="flex-1 min-w-0 border border-stone-200 rounded px-2 py-1 text-sm"
                                        value={editLabel}
                                        onChange={(e) => setEditLabel(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") void handleSaveEdit();
                                            if (e.key === "Escape") setEditingId(null);
                                        }}
                                        autoFocus
                                    />
                                    <select
                                        className="border border-stone-200 rounded px-2 py-1 text-xs"
                                        value={editType}
                                        onChange={(e) => setEditType(e.target.value)}
                                    >
                                        {FIELD_TYPES.map((t) => (
                                            <option key={t.value} value={t.value}>
                                                {t.label}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => void handleSaveEdit()}
                                        disabled={saving}
                                        className="text-xs text-amber-600 font-medium shrink-0"
                                    >
                                        저장
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditingId(null)}
                                        className="text-xs text-stone-400 shrink-0"
                                    >
                                        취소
                                    </button>
                                </>
                            ) : (
                                <>
                                    <i
                                        className={`${fieldTypeIcon(def.field_type)} text-stone-400 text-sm shrink-0`}
                                        aria-hidden
                                    />
                                    <span className="flex-1 min-w-0 text-sm text-stone-700 truncate">
                                        {def.label}
                                    </span>
                                    <span className="text-[10px] text-stone-400 bg-stone-100 rounded px-1.5 py-0.5 shrink-0">
                                        {fieldTypeLabel(def.field_type)}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => startEdit(def)}
                                        className="text-stone-400 hover:text-amber-500 transition-colors shrink-0"
                                        aria-label="수정"
                                    >
                                        <i className="ri-pencil-line text-sm" aria-hidden />
                                    </button>
                                    {deleteConfirm === def.id ? (
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => void handleDelete(def.id)}
                                                disabled={saving}
                                                className="text-[10px] text-red-500 font-medium"
                                            >
                                                삭제
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeleteConfirm(null)}
                                                className="text-[10px] text-stone-400"
                                            >
                                                취소
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setDeleteConfirm(def.id)}
                                            className="text-stone-400 hover:text-red-500 transition-colors shrink-0"
                                            aria-label="삭제"
                                        >
                                            <i className="ri-delete-bin-line text-sm" aria-hidden />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </div>

                {/* 새 필드 추가 */}
                <div className="border-t border-stone-100 pt-4">
                    <label className="text-xs font-medium text-stone-500 block mb-2">
                        새 필드 추가
                    </label>
                    <div className="flex gap-2">
                        <input
                            className="flex-1 min-w-0 border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                            placeholder="필드 이름 (예: 운영 관리자 PW)"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void handleAdd();
                            }}
                        />
                        <select
                            className="border border-stone-200 rounded-lg px-2 py-2.5 text-sm"
                            value={newType}
                            onChange={(e) => setNewType(e.target.value)}
                        >
                            {FIELD_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => void handleAdd()}
                            disabled={saving || !newLabel.trim()}
                            className="bg-amber-500 text-white text-sm font-medium px-4 rounded-lg disabled:opacity-50"
                        >
                            추가
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
