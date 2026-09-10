"use client";

import { useEffect, useRef, useState } from "react";
import {
    ACCESS_FIELD_KEYS,
    ACCESS_LABELS,
    isSystemField,
    type FieldDef,
} from "./useProjectFields";

const isSafeUrl = (url: string) => /^https?:\/\//i.test(url);

const FIELD_TYPE_OPTIONS = [
    { value: "text", label: "텍스트" },
    { value: "url", label: "URL" },
    { value: "secret", label: "비밀번호" },
    { value: "textarea", label: "메모" },
] as const;

/** 클릭하면 편집 가능한 라벨 */
function EditableLabel({
    label,
    onRename,
    suffix,
}: {
    label: string;
    onRename: (newLabel: string) => void;
    suffix?: React.ReactNode;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(label);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);

    if (editing) {
        return (
            <input
                ref={inputRef}
                className="text-xs font-medium text-stone-700 border-b border-amber-400 outline-none bg-transparent py-0"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => { if (draft.trim() && draft !== label) onRename(draft.trim()); setEditing(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") { if (draft.trim() && draft !== label) onRename(draft.trim()); setEditing(false); } if (e.key === "Escape") { setDraft(label); setEditing(false); } }}
            />
        );
    }

    return (
        <label className="text-xs font-medium text-stone-500 cursor-pointer hover:text-stone-700 transition-colors" onClick={() => { setDraft(label); setEditing(true); }}>
            {label}{suffix}
        </label>
    );
}

/** 비밀번호 입력 — 눈 아이콘 토글 */
function SecretInput({
    value,
    onChange,
    placeholder = "",
    hasSavedValue = false,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    hasSavedValue?: boolean;
}) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <input
                type={visible ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={hasSavedValue && !value ? "●●●●●● (저장됨 · 변경 시 입력)" : placeholder}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
            />
            <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                aria-label={visible ? "숨기기" : "보기"}
            >
                <i className={`${visible ? "ri-eye-line" : "ri-eye-off-line"} text-base`} />
            </button>
        </div>
    );
}

// ─── 접속 정보 섹션 ─────────────────────────

type AccessSectionProps = {
    defs: FieldDef[];
    values: Record<string, string>;
    onChange: (key: string, val: string) => void;
    onAddField?: (label: string, fieldType: string, namePrefix: string) => Promise<void>;
    onDeleteField?: (defId: number) => Promise<void>;
    onRenameField?: (defId: number, newLabel: string) => Promise<void>;
    onReorderFields?: (reorder: { id: number; sort_order: number }[]) => Promise<void>;
    savedSecrets?: Set<string>;
};

export function AccessSection({ defs, values, onChange, onAddField, onDeleteField, onRenameField, onReorderFields, savedSecrets }: AccessSectionProps) {
    const [env, setEnv] = useState<"prod" | "local">("prod");
    const [newLabel, setNewLabel] = useState("");
    const [newType, setNewType] = useState("text");
    const [adding, setAdding] = useState(false);
    const accDragRef = useRef<number | undefined>(undefined);

    const envLabel = env === "prod" ? "운영" : "로컬";
    const prefix = `access_${env}_`;

    return (
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <span className="text-sm font-bold text-stone-700">접속 정보</span>
                <div className="flex rounded-lg bg-stone-100 p-0.5">
                    {(["prod", "local"] as const).map((e) => (
                        <button
                            key={e}
                            type="button"
                            onClick={() => setEnv(e)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                env === e
                                    ? "bg-amber-500 text-white shadow-sm"
                                    : "text-stone-500 hover:text-stone-700"
                            }`}
                        >
                            {e === "prod" ? "운영" : "로컬"}
                        </button>
                    ))}
                </div>
            </div>
            <div className="px-4 pb-4 space-y-3">
                {ACCESS_FIELD_KEYS.map((key) => {
                    const fieldName = `${prefix}${key}`;
                    const def = defs.find((d) => d.name === fieldName);
                    if (!def) return null;
                    const isSecret = key === "admin_id" || key === "admin_pw";
                    const isUrl = key === "homepage" || key === "admin_url";
                    return (
                        <div key={key}>
                            <label className="text-xs font-medium text-stone-500 block mb-1">
                                {ACCESS_LABELS[key]}
                                <span className="text-[10px] text-stone-300 ml-1">({envLabel})</span>
                            </label>
                            {isSecret ? (
                                <SecretInput
                                    value={values[fieldName] ?? ""}
                                    onChange={(v) => onChange(fieldName, v)}
                                    hasSavedValue={savedSecrets?.has(fieldName)}
                                />
                            ) : (
                                <input
                                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                                    type="text"
                                    placeholder={isUrl ? "https://" : ""}
                                    value={values[fieldName] ?? ""}
                                    onChange={(e) => onChange(fieldName, e.target.value)}
                                />
                            )}
                        </div>
                    );
                })}
                {/* 커스텀 접속 정보 필드 */}
                {(() => {
                    const customDefs = defs
                        .filter((d) => d.name.startsWith(prefix) && !ACCESS_FIELD_KEYS.some((k) => d.name === `${prefix}${k}`))
                        .sort((a, b) => a.sort_order - b.sort_order);
                    return customDefs.map((def, idx) => (
                        <div
                            key={def.id}
                            draggable={Boolean(onReorderFields)}
                            onDragStart={() => { accDragRef.current = idx; }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                                const from = accDragRef.current;
                                if (from === undefined || from === idx || !onReorderFields) return;
                                const next = [...customDefs];
                                const [moved] = next.splice(from, 1);
                                next.splice(idx, 0, moved);
                                void onReorderFields(next.map((d, i) => ({ id: d.id, sort_order: i })));
                            }}
                        >
                            <div className="flex items-center gap-1.5 mb-1">
                                {onReorderFields && <i className="ri-draggable text-stone-300 cursor-grab active:cursor-grabbing" aria-hidden />}
                                <div className="flex-1 min-w-0">
                                    {onRenameField ? (
                                        <EditableLabel label={def.label} onRename={(v) => void onRenameField(def.id, v)} suffix={<span className="text-[10px] text-stone-300 ml-1">({envLabel})</span>} />
                                    ) : (
                                        <label className="text-xs font-medium text-stone-500">{def.label}<span className="text-[10px] text-stone-300 ml-1">({envLabel})</span></label>
                                    )}
                                </div>
                                {onDeleteField && (
                                    <button type="button" onClick={() => void onDeleteField(def.id)} className="text-stone-300 hover:text-red-400 transition-colors" aria-label="삭제"><i className="ri-close-line text-base" aria-hidden /></button>
                                )}
                            </div>
                            {def.field_type === "secret" ? (
                                <SecretInput value={values[def.name] ?? ""} onChange={(v) => onChange(def.name, v)} hasSavedValue={savedSecrets?.has(def.name)} />
                            ) : (
                                <input className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100" placeholder={def.field_type === "url" ? "https://" : ""} value={values[def.name] ?? ""} onChange={(e) => onChange(def.name, e.target.value)} />
                            )}
                        </div>
                    ));
                })()}
                {onAddField && (
                    <div className="flex items-end gap-2 pt-1">
                        <input className="flex-1 min-w-0 rounded-lg border border-dashed border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 placeholder:text-stone-400" placeholder="+ 필드 추가" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                        <select style={{ appearance: "auto", WebkitAppearance: "auto" as never, backgroundImage: "initial" }} className="rounded-lg border border-stone-200 px-2 py-2 text-sm outline-none" value={newType} onChange={(e) => setNewType(e.target.value)}>
                            <option value="text">텍스트</option>
                            <option value="url">URL</option>
                            <option value="secret">비밀번호</option>
                        </select>
                        <button type="button" disabled={adding || !newLabel.trim()} onClick={async () => { setAdding(true); try { await onAddField(newLabel.trim(), newType, `access_${env}_`); setNewLabel(""); setNewType("text"); } finally { setAdding(false); } }} className="rounded-lg bg-stone-200 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-300 disabled:opacity-40 transition-colors shrink-0">추가</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── 개발 환경 섹션 ─────────────────────────

type DevSectionProps = {
    defs: FieldDef[];
    values: Record<string, string>;
    onChange: (key: string, val: string) => void;
    onAddField?: (label: string, fieldType: string, namePrefix: string) => Promise<void>;
    onDeleteField?: (defId: number) => Promise<void>;
    onRenameField?: (defId: number, newLabel: string) => Promise<void>;
    onReorderFields?: (reorder: { id: number; sort_order: number }[]) => Promise<void>;
};

function RadioGroup({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div>
            <label className="text-xs font-medium text-stone-500 block mb-1.5">{label}</label>
            <div className="flex gap-2">
                {options.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={`flex-1 rounded-lg border-2 py-2.5 text-sm font-medium transition-colors ${
                            value === opt.value
                                ? "border-amber-500 bg-amber-50 text-stone-800"
                                : "border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-300"
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

const DEV_TEXT_FIELDS = [
    { name: "dev_vcs_url", label: "저장소 URL", placeholder: "줄바꿈으로 여러 개 입력\nhttps://svn.example.com/repo/trunk\nhttps://svn.example.com/repo2/trunk", multiline: true },
    { name: "dev_jdk", label: "JDK/JRE", placeholder: "예) 17, 11, 8" },
    { name: "dev_tomcat", label: "Tomcat", placeholder: "예) 10.1.18, 9.0.87" },
];

export function DevSection({ defs, values, onChange, onAddField, onDeleteField, onRenameField, onReorderFields }: DevSectionProps) {
    const hasDef = (name: string) => defs.some((d) => d.name === name);
    const [newLabel, setNewLabel] = useState("");
    const [newType, setNewType] = useState("text");
    const [adding, setAdding] = useState(false);
    const devDragRef = useRef<number | undefined>(undefined);

    const knownDevNames = new Set(["dev_ide", "dev_vcs", "dev_project_path", ...DEV_TEXT_FIELDS.map((f) => f.name)]);

    return (
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="px-4 pt-3 pb-2">
                <span className="text-sm font-bold text-stone-700">개발 환경</span>
            </div>
            <div className="px-4 pb-4 space-y-3">
                {hasDef("dev_ide") && (
                    <RadioGroup
                        label="IDE"
                        options={[
                            { value: "intellij", label: "IntelliJ" },
                            { value: "eclipse", label: "Eclipse" },
                        ]}
                        value={values.dev_ide ?? ""}
                        onChange={(v) => onChange("dev_ide", v)}
                    />
                )}
                {hasDef("dev_project_path") && (
                    <div>
                        <label className="text-xs font-medium text-stone-500 block mb-1">프로젝트 경로</label>
                        <input
                            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                            placeholder="예) D:\workspace\project-name"
                            value={values.dev_project_path ?? ""}
                            onChange={(e) => onChange("dev_project_path", e.target.value)}
                        />
                    </div>
                )}
                {hasDef("dev_vcs") && (
                    <RadioGroup
                        label="형상관리"
                        options={[
                            { value: "svn", label: "SVN" },
                            { value: "git", label: "Git" },
                        ]}
                        value={values.dev_vcs ?? ""}
                        onChange={(v) => onChange("dev_vcs", v)}
                    />
                )}
                {DEV_TEXT_FIELDS.map((field) =>
                    hasDef(field.name) ? (
                        <div key={field.name}>
                            <label className="text-xs font-medium text-stone-500 block mb-1">
                                {field.label}
                            </label>
                            {field.multiline ? (
                                <textarea
                                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm min-h-[4.5rem] resize-y outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                                    placeholder={field.placeholder}
                                    value={values[field.name] ?? ""}
                                    onChange={(e) => onChange(field.name, e.target.value)}
                                />
                            ) : (
                                <input
                                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                                    placeholder={field.placeholder}
                                    value={values[field.name] ?? ""}
                                    onChange={(e) => onChange(field.name, e.target.value)}
                                />
                            )}
                        </div>
                    ) : null,
                )}
                {/* 커스텀 개발 환경 필드 */}
                {(() => {
                    const customDefs = defs
                        .filter((d) => d.name.startsWith("dev_") && !knownDevNames.has(d.name))
                        .sort((a, b) => a.sort_order - b.sort_order);
                    return customDefs.map((def, idx) => (
                        <div
                            key={def.id}
                            draggable={Boolean(onReorderFields)}
                            onDragStart={() => { devDragRef.current = idx; }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                                const from = devDragRef.current;
                                if (from === undefined || from === idx || !onReorderFields) return;
                                const next = [...customDefs];
                                const [moved] = next.splice(from, 1);
                                next.splice(idx, 0, moved);
                                void onReorderFields(next.map((d, i) => ({ id: d.id, sort_order: i })));
                            }}
                        >
                            <div className="flex items-center gap-1.5 mb-1">
                                {onReorderFields && <i className="ri-draggable text-stone-300 cursor-grab active:cursor-grabbing" aria-hidden />}
                                <div className="flex-1 min-w-0">
                                    {onRenameField ? (
                                        <EditableLabel label={def.label} onRename={(v) => void onRenameField(def.id, v)} />
                                    ) : (
                                        <label className="text-xs font-medium text-stone-500">{def.label}</label>
                                    )}
                                </div>
                                {onDeleteField && (
                                    <button type="button" onClick={() => void onDeleteField(def.id)} className="text-stone-300 hover:text-red-400 transition-colors" aria-label="삭제"><i className="ri-close-line text-base" aria-hidden /></button>
                                )}
                            </div>
                            <input className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100" value={values[def.name] ?? ""} onChange={(e) => onChange(def.name, e.target.value)} />
                        </div>
                    ));
                })()}
                {onAddField && (
                    <div className="flex items-end gap-2 pt-1">
                        <input className="flex-1 min-w-0 rounded-lg border border-dashed border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 placeholder:text-stone-400" placeholder="+ 필드 추가" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                        <select style={{ appearance: "auto", WebkitAppearance: "auto" as never, backgroundImage: "initial" }} className="rounded-lg border border-stone-200 px-2 py-2 text-sm outline-none" value={newType} onChange={(e) => setNewType(e.target.value)}>
                            <option value="text">텍스트</option>
                            <option value="url">URL</option>
                        </select>
                        <button type="button" disabled={adding || !newLabel.trim()} onClick={async () => { setAdding(true); try { await onAddField(newLabel.trim(), newType, "dev_"); setNewLabel(""); setNewType("text"); } finally { setAdding(false); } }} className="rounded-lg bg-stone-200 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-300 disabled:opacity-40 transition-colors shrink-0">추가</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── 기타 필드 섹션 (드래그 순서 변경, 추가/삭제) ──

type ExtraField = {
    key: string;
    label: string;
    fieldType: string;
    isFixed: boolean;
    defId?: number;
};

type ExtraSectionProps = {
    fields: ExtraField[];
    values: Record<string, string>;
    onChange: (key: string, val: string) => void;
    onReorder: (fields: ExtraField[]) => void;
    onDelete: (field: ExtraField) => void;
    onAdd: (label: string, fieldType: string) => void;
    adding: boolean;
    savedSecrets?: Set<string>;
};

export function ExtraSection({
    fields,
    values,
    onChange,
    onReorder,
    onDelete,
    onAdd,
    adding,
    savedSecrets,
}: ExtraSectionProps) {
    const [newLabel, setNewLabel] = useState("");
    const [newType, setNewType] = useState("text");
    const extraDragRef = useRef<number | undefined>(undefined);

    return (
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="px-4 pt-3 pb-2">
                <span className="text-sm font-bold text-stone-700">기타</span>
            </div>
            <div className="px-4 pb-4 space-y-2">
                {fields.map((field, idx) => (
                    <div
                        key={field.key}
                        draggable
                        onDragStart={() => {
                            extraDragRef.current = idx;
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                            const from = extraDragRef.current;
                            if (from === undefined || from === idx) return;
                            const next = [...fields];
                            const [moved] = next.splice(from, 1);
                            next.splice(idx, 0, moved);
                            onReorder(next);
                        }}
                        className="rounded-lg border border-stone-100 bg-stone-50/50 p-3"
                    >
                        <div className="flex items-center gap-2 mb-1.5">
                            <i className="ri-draggable text-lg text-stone-300 cursor-grab active:cursor-grabbing" aria-hidden />
                            <span className="text-sm font-medium text-stone-600 flex-1">{field.label}</span>
                            <button
                                type="button"
                                onClick={() => onDelete(field)}
                                className="text-stone-300 hover:text-red-400 transition-colors shrink-0"
                                aria-label="삭제"
                            >
                                <i className="ri-delete-bin-line text-lg" aria-hidden />
                            </button>
                        </div>
                        {field.fieldType === "textarea" ? (
                            <textarea
                                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm min-h-[4rem] resize-y outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                                value={values[field.key] ?? ""}
                                onChange={(e) => onChange(field.key, e.target.value)}
                            />
                        ) : field.fieldType === "secret" ? (
                            <SecretInput
                                value={values[field.key] ?? ""}
                                onChange={(v) => onChange(field.key, v)}
                                hasSavedValue={savedSecrets?.has(field.key)}
                                placeholder="빈칸이면 기존 값 유지"
                            />
                        ) : (
                            <input
                                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                                placeholder={field.fieldType === "url" ? "https://" : ""}
                                value={values[field.key] ?? ""}
                                onChange={(e) => onChange(field.key, e.target.value)}
                            />
                        )}
                    </div>
                ))}
                {/* 필드 추가 */}
                <div className="flex items-end gap-2 pt-1">
                    <input
                        className="flex-1 min-w-0 rounded-lg border border-dashed border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-300 placeholder:text-stone-400"
                        placeholder="+ 새 필드 이름"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                    />
                    <select
                        style={{ appearance: "auto", WebkitAppearance: "auto" as never, backgroundImage: "initial" }}
                        className="rounded-lg border border-stone-200 px-2 py-2.5 text-sm outline-none"
                        value={newType}
                        onChange={(e) => setNewType(e.target.value)}
                    >
                        {FIELD_TYPE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        disabled={adding || !newLabel.trim()}
                        onClick={() => {
                            onAdd(newLabel.trim(), newType);
                            setNewLabel("");
                            setNewType("text");
                        }}
                        className="rounded-lg bg-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-300 disabled:opacity-40 transition-colors shrink-0"
                    >
                        추가
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── 읽기 뷰 — 접속 정보 카드 ──────────────

type AccessReadProps = {
    defs: FieldDef[];
    values: Map<number, { value: string | null; has_secret: boolean }>;
    onReveal: (defId: number) => Promise<string>;
    onRevealAll?: (defIds: number[]) => Promise<Record<number, string>>;
};

export function AccessReadCard({ defs, values, onReveal, onRevealAll }: AccessReadProps) {
    const [env, setEnv] = useState<"prod" | "local">("prod");
    const [revealed, setRevealed] = useState<Record<number, string>>({});
    const [revealing, setRevealing] = useState<number | null>(null);
    const [revealingAll, setRevealingAll] = useState(false);

    const prefix = `access_${env}_`;
    // 현재 선택된 env(운영/로컬) 탭의 prefix 에 맞는 필드만 확인하여
    // "접속 정보" 카드 표시 여부를 결정한다. 양쪽 env 를 모두 체크하면
    // 한쪽에만 값이 있을 때 빈 카드가 보인다.
    const hasAny = defs.some((d) => d.name.startsWith(prefix) && values.get(d.id)?.value);

    // 현재 env의 secret 필드 중 아직 노출되지 않은 defId 목록
    const unrevealedSecretIds = defs
        .filter((d) => d.name.startsWith(prefix) && d.field_type === "secret" && values.get(d.id)?.has_secret && !revealed[d.id])
        .map((d) => d.id);

    const handleRevealAll = async () => {
        if (!onRevealAll || unrevealedSecretIds.length === 0) return;
        setRevealingAll(true);
        try {
            const map = await onRevealAll(unrevealedSecretIds);
            setRevealed((p) => ({ ...p, ...map }));
        } catch {}
        setRevealingAll(false);
    };

    if (!hasAny && !defs.some((d) => d.name.startsWith(prefix) && values.get(d.id)?.has_secret)) {
        return null;
    }

    return (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-stone-700">접속 정보</span>
                    {onRevealAll && unrevealedSecretIds.length > 0 && (
                        <button
                            type="button"
                            disabled={revealingAll}
                            onClick={handleRevealAll}
                            className="text-xs text-amber-500 font-medium disabled:opacity-50"
                        >{revealingAll ? "불러오는 중..." : "전체 보기"}</button>
                    )}
                </div>
                <div className="flex rounded-lg bg-stone-100 p-0.5">
                    {(["prod", "local"] as const).map((e) => (
                        <button
                            key={e}
                            type="button"
                            onClick={() => setEnv(e)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                env === e
                                    ? "bg-amber-500 text-white shadow-sm"
                                    : "text-stone-500 hover:text-stone-700"
                            }`}
                        >
                            {e === "prod" ? "운영" : "로컬"}
                        </button>
                    ))}
                </div>
            </div>
            <div className="space-y-2">
                {ACCESS_FIELD_KEYS.map((key) => {
                    const def = defs.find((d) => d.name === `${prefix}${key}`);
                    if (!def) return null;
                    const val = values.get(def.id);
                    if (!val?.value && !val?.has_secret) return null;
                    const isSecret = key === "admin_id" || key === "admin_pw";
                    const isUrl = def.field_type === "url";
                    return (
                        <div key={key} className="flex items-start gap-3">
                            <span className="text-sm text-stone-500 w-20 shrink-0 font-medium">{ACCESS_LABELS[key]}</span>
                            {isSecret ? (
                                <div className="flex items-center gap-2">
                                    {revealed[def.id] ? (
                                        <>
                                            <span className="text-sm text-stone-700 font-mono break-all">{revealed[def.id]}</span>
                                            <button type="button" onClick={() => setRevealed((p) => { const n = { ...p }; delete n[def.id]; return n; })} className="text-xs text-stone-400 shrink-0">숨기기</button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-sm text-stone-400 tracking-widest">●●●●●●</span>
                                            <button
                                                type="button"
                                                disabled={revealing === def.id}
                                                onClick={async () => { setRevealing(def.id); try { const v = await onReveal(def.id); setRevealed((p) => ({ ...p, [def.id]: v })); } catch {} setRevealing(null); }}
                                                className="text-xs text-amber-500 font-medium disabled:opacity-50 shrink-0"
                                            >{revealing === def.id ? "..." : "보기"}</button>
                                        </>
                                    )}
                                </div>
                            ) : isUrl && val.value ? (
                                isSafeUrl(val.value) ? (
                                    <a href={val.value} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">{val.value}</a>
                                ) : (
                                    <span className="text-sm text-stone-700 break-all">{val.value}</span>
                                )
                            ) : (
                                <span className="text-sm text-stone-700 break-all">{val.value}</span>
                            )}
                        </div>
                    );
                })}
                {/* 커스텀 접속 필드 */}
                {defs
                    .filter((d) => d.name.startsWith(prefix) && !ACCESS_FIELD_KEYS.some((k) => d.name === `${prefix}${k}`))
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((def) => {
                        const val = values.get(def.id);
                        if (!val?.value && !val?.has_secret) return null;
                        return (
                            <div key={def.id} className="flex items-start gap-3">
                                <span className="text-sm text-stone-500 w-20 shrink-0 font-medium">{def.label}</span>
                                {def.field_type === "secret" ? (
                                    <div className="flex items-center gap-2">
                                        {revealed[def.id] ? (
                                            <>
                                                <span className="text-sm text-stone-700 font-mono break-all">{revealed[def.id]}</span>
                                                <button type="button" onClick={() => setRevealed((p) => { const n = { ...p }; delete n[def.id]; return n; })} className="text-xs text-stone-400 shrink-0">숨기기</button>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-sm text-stone-400 tracking-widest">●●●●●●</span>
                                                <button type="button" disabled={revealing === def.id} onClick={async () => { setRevealing(def.id); try { const v = await onReveal(def.id); setRevealed((p) => ({ ...p, [def.id]: v })); } catch {} setRevealing(null); }} className="text-xs text-amber-500 font-medium disabled:opacity-50 shrink-0">{revealing === def.id ? "..." : "보기"}</button>
                                            </>
                                        )}
                                    </div>
                                ) : def.field_type === "url" && val.value ? (
                                    isSafeUrl(val.value) ? (
                                        <a href={val.value} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">{val.value}</a>
                                    ) : (
                                        <span className="text-sm text-stone-700 break-all">{val.value}</span>
                                    )
                                ) : (
                                    <span className="text-sm text-stone-700 break-all whitespace-pre-wrap">{val.value}</span>
                                )}
                            </div>
                        );
                    })}
            </div>
        </div>
    );
}

// ─── 읽기 뷰 — 개발 환경 카드 ──────────────

type DevReadProps = {
    defs: FieldDef[];
    values: Map<number, { value: string | null; has_secret: boolean }>;
};

const IDE_LABELS: Record<string, string> = { intellij: "IntelliJ", eclipse: "Eclipse" };
const VCS_LABELS: Record<string, string> = { svn: "SVN", git: "Git" };

export function DevReadCard({ defs, values }: DevReadProps) {
    const devDefs = defs.filter((d) => d.name.startsWith("dev_"));
    const hasAny = devDefs.some((d) => values.get(d.id)?.value);
    if (!hasAny) return null;

    function getVal(name: string) {
        const def = defs.find((d) => d.name === name);
        return def ? (values.get(def.id)?.value ?? "") : "";
    }

    const ide = getVal("dev_ide");
    const vcs = getVal("dev_vcs");

    return (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
            <span className="text-sm font-bold text-stone-700 block mb-3">개발 환경</span>
            <div className="space-y-2">
                {ide && (
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-stone-500 w-20 shrink-0 font-medium">IDE</span>
                        <span className="text-sm font-medium text-amber-700 bg-amber-50 rounded-md px-2.5 py-1">{IDE_LABELS[ide] ?? ide}</span>
                    </div>
                )}
                {vcs && (
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-stone-500 w-20 shrink-0 font-medium">형상관리</span>
                        <span className="text-sm font-medium text-blue-700 bg-blue-50 rounded-md px-2.5 py-1">{VCS_LABELS[vcs] ?? vcs}</span>
                    </div>
                )}
                {["dev_project_path", "dev_vcs_url", "dev_jdk", "dev_tomcat"].map((name) => {
                    const val = getVal(name);
                    if (!val) return null;
                    const label = { dev_project_path: "경로", dev_vcs_url: "저장소", dev_jdk: "JDK/JRE", dev_tomcat: "Tomcat" }[name];
                    return (
                        <div key={name} className="flex items-start gap-3">
                            <span className="text-sm text-stone-500 w-20 shrink-0 font-medium">{label}</span>
                            <span className="text-sm text-stone-700 break-all whitespace-pre-wrap">{val}</span>
                        </div>
                    );
                })}
                {/* 커스텀 개발 환경 필드 */}
                {defs
                    .filter((d) => d.name.startsWith("dev_") && !["dev_ide", "dev_vcs", "dev_project_path", "dev_vcs_url", "dev_jdk", "dev_tomcat"].includes(d.name))
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((def) => {
                        const val = getVal(def.name);
                        if (!val) return null;
                        return (
                            <div key={def.id} className="flex items-start gap-3">
                                <span className="text-sm text-stone-500 w-20 shrink-0 font-medium">{def.label}</span>
                                <span className="text-sm text-stone-700 break-all whitespace-pre-wrap">{val}</span>
                            </div>
                        );
                    })}
            </div>
        </div>
    );
}

/** 시스템 필드가 아닌 순수 기타 필드만 필터 */
export function filterExtraFields(defs: FieldDef[]): FieldDef[] {
    return defs.filter((d) => !isSystemField(d.name));
}
