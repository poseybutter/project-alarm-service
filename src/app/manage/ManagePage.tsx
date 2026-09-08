"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import { supabase } from "@/infrastructure/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import AuthGuard from "@/components/AuthGuard";
import UserMenu from "@/components/UserMenu";
import TeamSwitcher from "@/components/TeamSwitcher";
import NotificationButton from "@/components/NotificationButton";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import Avatar from "@/components/Avatar";

import { PageSpinner } from "@/components/Spinner";
import type { Accessibility, Project } from "@/shared/types";
import {
    findProjectId,
    findTeamMemberId,
    getDiff,
    normalizeProject,
    getProjectMembers,
} from "@/shared/utils/utils";
import Select from "react-select";
import {
    selectStyles,
    taskFilterProjectSelectStyles,
    modalFormSelectStyles,
    badgeSelectStyles,
} from "@/shared/styles/reactSelectStyles";
import { toLocalYmd } from "@/shared/utils/toLocalYmd";
import { useProjectFields, type FieldDef } from "./useProjectFields";
import {
    AccessSection,
    DevSection,
    ExtraSection,
    AccessReadCard,
    DevReadCard,
    filterExtraFields,
} from "./ProjectFieldSections";
import FieldHistoryPanel from "./FieldHistoryPanel";

const MAINTENANCE_STATUS_URL =
    process.env.NEXT_PUBLIC_MAINTENANCE_STATUS_URL?.trim() ?? "";

const EMPTY_PROJ_FORM = {
    name: "",
    client: "",
    members: [] as string[],
    languages: [] as string[],
    pm: "",
    developer: "",
    designer: "",
    prev_member: "",
    frequency: "",
    note: "",
};

const PROJ_LANG_OPTIONS = ["PHP", "JSP", "기타"] as const;

const ACC_INSPECTION_OPTIONS = [
    "신청필요",
    "신청완료",
    "취득·갱신완료",
    "신청불필요",
] as const;

/** 접근성 점검 상태별 배지 스타일 */
function accStatusStyle(status: string) {
    if (status === "취득·갱신완료") return "bg-green-100 text-green-700";
    if (status === "신청완료") return "bg-blue-100 text-blue-700";
    if (status === "신청불필요") return "bg-stone-100 text-stone-500";
    return "bg-amber-100 text-amber-700"; // 신청필요
}

const ACC_OPTIONS = ACC_INSPECTION_OPTIONS.map((s) => ({
    value: s,
    label: s,
}));

function accMissionSnoozeKeys(
    row: Accessibility,
    status: string,
    kind: "apply" | "missing_schedule" | "result" | "renewal",
) {
    return [
        `${row.id}:${status}:${kind}`,
        `${row.id}:${status}:${row.end_date ?? ""}:${kind}`,
    ];
}

function formatAccStatusUpdatedAt(value?: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(date);
}

function accStatusAuditPayload(
    row: Accessibility | null,
    nextStatus: string,
    actor: string | null | undefined,
) {
    const previousStatus = row?.inspection_status ?? null;
    if (previousStatus === nextStatus) return {};
    return {
        previous_inspection_status: previousStatus,
        status_updated_at: new Date().toISOString(),
        status_updated_by: actor ?? null,
    };
}

function notifyAccessibilityChanged() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("accessibility:changed"));
}

function AccInspectionBadgeSelect({
    status,
    disabled,
    onChange,
}: {
    status: string;
    disabled: boolean;
    onChange: (next: string) => void;
}) {
    return (
        <div
            className={`rounded-lg ${accStatusStyle(status)} ${disabled ? "opacity-70 cursor-not-allowed" : ""}`}
        >
            <Select
                options={ACC_OPTIONS}
                value={{ value: status, label: status }}
                isDisabled={disabled}
                onChange={(opt) => {
                    if (!opt) return;
                    onChange(opt.value);
                }}
                isSearchable={false}
                isClearable={false}
                styles={badgeSelectStyles}
                menuPortalTarget={
                    typeof document !== "undefined" ? document.body : null
                }
                menuPlacement="auto"
            />
        </div>
    );
}

/** 고정 필드 정의 — 커스텀 필드와 통합하여 순서 변경 가능 */
const FIXED_FIELDS = [
    { key: "pm", label: "PM", fieldType: "text" as const },
    { key: "developer", label: "개발자", fieldType: "text" as const },
    { key: "designer", label: "디자이너", fieldType: "text" as const },
    { key: "frequency", label: "빈도", fieldType: "text" as const },
    { key: "prev_member", label: "이전 담당자", fieldType: "text" as const },
    { key: "note", label: "비고", fieldType: "textarea" as const },
] as const;


/** 칩 필터 — 클릭 시 드롭다운 옵션 표시 (29cm 스타일) */
function FilterChip({
    label,
    active,
    options,
    onSelect,
}: {
    label: string;
    active: boolean;
    options: { value: string; label: string }[];
    onSelect: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function handle(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
            >
                {label} <i className={`ri-arrow-${open ? "up" : "down"}-s-line text-[10px] ml-0.5`} aria-hidden />
            </button>
            {open && (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-[7rem] overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => { onSelect(opt.value); setOpen(false); }}
                            className={`block w-full px-3 py-1.5 text-left text-xs transition-colors ${
                                label === opt.label ? "bg-amber-50 font-bold text-amber-700" : "text-stone-600 hover:bg-stone-50"
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/** 프로젝트 상세 — 기본 정보 / 세팅 정보 탭 (PIN 보호) */
function ProjectDetailTabs({
    project: p,
    projMembers,
    pf,
    isGuest,
    onEdit,
    onDelete,
    onArchive,
    onHistory,
    hasPin,
    pinVerified,
    onPinRequired,
}: {
    project: import("@/shared/types").Project;
    projMembers: string[];
    pf: ReturnType<typeof useProjectFields>;
    isGuest: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onArchive: () => void;
    onHistory: () => void;
    hasPin: boolean;
    pinVerified: boolean;
    onPinRequired: (callback: () => void) => void;
}) {
    const [tab, setTab] = useState<"basic" | "setting">("basic");
    const [defs, setDefs] = useState<FieldDef[]>([]);
    const [values, setValues] = useState<import("./useProjectFields").FieldValue[]>([]);
    const [loaded, setLoaded] = useState(false);

    const needsPin = hasPin && !pinVerified;

    function handleSettingTab() {
        if (needsPin) {
            onPinRequired(() => setTab("setting"));
        } else {
            setTab("setting");
        }
    }

    function handleHistory() {
        if (needsPin) {
            onPinRequired(onHistory);
        } else {
            onHistory();
        }
    }

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const [d, v] = await Promise.all([pf.loadDefs(p.id), pf.loadValues(p.id)]);
            if (!cancelled) { setDefs(d); setValues(v); setLoaded(true); }
        })();
        return () => { cancelled = true; };
    }, [p.id, pf]);

    const valueMap = new Map(values.map((v) => [v.field_def_id, { value: v.value, has_secret: v.has_secret }]));

    const fixedLabelMap: Record<string, string> = {
        pm: "PM", developer: "개발자", designer: "디자이너",
        frequency: "빈도", prev_member: "이전담당", note: "비고",
    };
    const fixedValues: Record<string, string | null> = {
        pm: p.pm, developer: p.developer, designer: p.designer,
        frequency: p.frequency, prev_member: p.prev_member, note: p.note,
    };
    const order = p.field_order ?? Object.keys(fixedLabelMap);
    const extraDefs = filterExtraFields(defs);

    return (
        <div className="px-4 pb-4 pt-1">
            {/* 탭 + 이력 */}
            <div className="flex items-center gap-2 mb-3">
                <div className="flex flex-1 rounded-lg bg-stone-100 p-0.5">
                    <button
                        type="button"
                        onClick={() => setTab("basic")}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                            tab === "basic" ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600"
                        }`}
                    >
                        기본 정보
                    </button>
                    <button
                        type="button"
                        onClick={handleSettingTab}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                            tab === "setting" ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600"
                        }`}
                    >
                        세팅 정보{hasPin && <i className="ri-lock-line text-[10px] ml-1" aria-hidden />}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={handleHistory}
                    className="shrink-0 text-stone-300 hover:text-amber-500 transition-colors"
                    aria-label="업데이트 이력"
                    title="업데이트 이력"
                >
                    <i className="ri-time-line text-lg" aria-hidden />
                </button>
            </div>

            {/* 기본 정보 탭 */}
            {tab === "basic" && (
                <div className="space-y-2">
                    {projMembers.length > 0 && (
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-stone-500 w-20 shrink-0 font-medium">담당자</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {projMembers.map((m) => (
                                    <div key={m} className="flex items-center gap-1">
                                        <Avatar name={m} size={18} />
                                        <span className="text-sm text-stone-700">{m}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {order.map((key) => {
                        if (fixedLabelMap[key]) {
                            const val = fixedValues[key];
                            if (!val) return null;
                            return (
                                <div key={key} className="flex items-start gap-3">
                                    <span className="text-sm text-stone-500 w-20 shrink-0 font-medium">{fixedLabelMap[key]}</span>
                                    <span className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{val}</span>
                                </div>
                            );
                        }
                        const def = extraDefs.find((d) => d.name === key);
                        if (!def) return null;
                        const val = valueMap.get(def.id);
                        if (!val?.value && !val?.has_secret) return null;
                        return (
                            <div key={key} className="flex items-start gap-3">
                                <span className="text-sm text-stone-500 w-20 shrink-0 font-medium">{def.label}</span>
                                <span className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{val.value}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 세팅 정보 탭 */}
            {tab === "setting" && loaded && (
                <div className="space-y-3">
                    <AccessReadCard
                        defs={defs}
                        values={valueMap}
                        onReveal={(defId) => pf.revealSecret(p.id, defId)}
                    />
                    <DevReadCard defs={defs} values={valueMap} />
                </div>
            )}
            {tab === "setting" && !loaded && (
                <p className="text-sm text-stone-400 text-center py-4">불러오는 중...</p>
            )}

            {/* 하단 버튼 */}
            {!isGuest && (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-stone-100">
                    <button type="button" onClick={onEdit} className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-medium text-white hover:bg-amber-600 transition-colors">수정</button>
                    <button type="button" onClick={onDelete} className="flex-1 rounded-lg border border-red-300 py-2 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors">삭제</button>
                    <button type="button" onClick={onArchive} className="flex-1 rounded-lg bg-stone-700 py-2 text-xs font-medium text-white hover:bg-stone-800 transition-colors">{p.is_archived ? "복원" : "보관"}</button>
                </div>
            )}
        </div>
    );
}

export default function ManagePage() {
    const { member, members, memberOptions, role, teamId } = useAuth();
    const isGuest = member === "GUEST" || role === "guest";
    const isAdmin = role === "admin";

    const [manageTab, setManageTab] = useState<"project" | "accessibility">(
        () =>
            typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("tab") ===
                "accessibility"
                ? "accessibility"
                : "project",
    );
    const [projects, setProjects] = useState<Project[]>([]);
    const [accessibility, setAccessibility] = useState<Accessibility[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [toast, setToast] = useState("");
    const [deleteTarget, setDeleteTarget] = useState<{
        type: "project" | "accessibility";
        id: number;
        name: string;
    } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const loadGenerationRef = useRef(0);

    const [showProjModal, setShowProjModal] = useState(false);
    const [showAccModal, setShowAccModal] = useState(false);
    const [editProj, setEditProj] = useState<Project | null>(null);
    const [editAcc, setEditAcc] = useState<Accessibility | null>(null);
    const [expandedProj, setExpandedProj] = useState<Record<number, boolean>>(
        {},
    );
    const [searchProj, setSearchProj] = useState("");
    const [filterProjMember, setFilterProjMember] = useState("");
    const [filterProjLang, setFilterProjLang] = useState("");
    const [sortProj, setSortProj] = useState<"가나다" | "담당자">("가나다");
    const [showArchived, setShowArchived] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [searchAcc, setSearchAcc] = useState("");
    const [filterAccMember, setFilterAccMember] = useState("");
    const [filterAccStatus, setFilterAccStatus] = useState("");
    const [sortAcc, setSortAcc] = useState<
        "날짜순" | "가나다순" | "담당자순"
    >("날짜순");
    const [showAccStartPicker, setShowAccStartPicker] = useState(false);
    const [showAccEndPicker, setShowAccEndPicker] = useState(false);
    const [historyProjectId, setHistoryProjectId] = useState<number | null>(null);
    const [projForm, setProjForm] = useState({ ...EMPTY_PROJ_FORM });
    const [accForm, setAccForm] = useState({
        proj: "",
        start_date: "",
        end_date: "",
        inspection_status: "신청필요",
        note: "",
        accMember: "",
        is_new: false,
    });

    const emptyAccForm = {
        proj: "",
        start_date: "",
        end_date: "",
        inspection_status: "신청필요",
        note: "",
        accMember: "",
        is_new: false,
    } as const;

    // 커스텀 필드 훅
    const pf = useProjectFields(teamId);
    // 수정 모달용 커스텀 필드 state
    const [modalDefs, setModalDefs] = useState<FieldDef[]>([]);
    const [modalValues, setModalValues] = useState<Record<string, string>>({});
    const [extraFields, setExtraFields] = useState<{ key: string; label: string; fieldType: string; isFixed: boolean; defId?: number }[]>([]);
    const [cfSaving, setCfSaving] = useState(false);
    const [modalTab, setModalTab] = useState<"basic" | "setting">("basic");
    const [savedSecrets, setSavedSecrets] = useState<Set<string>>(new Set());
    // PIN 관련 state (팀 레벨)
    const [teamHasPin, setTeamHasPin] = useState(false);
    const [pinVerifiedAt, setPinVerifiedAt] = useState<number>(0);
    const PIN_EXPIRY_MS = 5 * 60 * 1000; // 5분
    const pinVerified = pinVerifiedAt > 0 && Date.now() - pinVerifiedAt < PIN_EXPIRY_MS;
    const [pinModal, setPinModal] = useState<{ callback: () => void } | null>(null);
    const [pinInput, setPinInput] = useState("");
    const [pinError, setPinError] = useState(false);
    const [pinVerifying, setPinVerifying] = useState(false);
    const historyProject = historyProjectId
        ? projects.find((p) => p.id === historyProjectId)
        : null;

    // loadData를 useEffect보다 먼저 선언 (react-hooks/immutability)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 데이터 로딩 effect
    const loadData = useCallback(async () => {
        if (!teamId) return;
        const generation = ++loadGenerationRef.current;
        setLoading(true);
        setLoadError(null);
        let projData, accData;
        try {
            const [projResult, accResult] = await Promise.all([
                supabase
                    .from("projects")
                    .select("*")
                    .eq("team_id", teamId)
                    .order("name", { ascending: true }),
                supabase
                    .from("accessibility")
                    .select("*")
                    .eq("team_id", teamId)
                    .order("end_date", { ascending: true }),
            ]);
            if (projResult.error) throw projResult.error;
            if (accResult.error) throw accResult.error;
            projData = projResult.data;
            accData = accResult.data;
        } catch (err) {
            if (generation === loadGenerationRef.current) {
                setLoadError(
                    err instanceof Error
                        ? err.message
                        : "데이터를 불러오지 못했습니다.",
                );
                setLoading(false);
            }
            return;
        } finally {
            if (generation === loadGenerationRef.current) setLoading(false);
        }
        if (generation !== loadGenerationRef.current) return;
        setProjects(
            (projData || []).map((row) =>
                normalizeProject(row as Record<string, unknown>),
            ),
        );
        const normalizedAccessibility = (accData || []).map((row) => ({
                ...row,
                inspection_status:
                    row.inspection_status === "미신청"
                        ? "신청필요"
                        : row.inspection_status === "갱신완료"
                          ? "취득·갱신완료"
                          : row.inspection_status,
                is_new: row.is_new ?? false,
            })) as Accessibility[];
        setAccessibility(normalizedAccessibility);

        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const accId = Number(params.get("accId"));
            const row = normalizedAccessibility.find((item) => item.id === accId);
            if (row) {
                setManageTab("accessibility");
                openAccModalForEdit(row);
                params.delete("accId");
                const query = params.toString();
                window.history.replaceState(
                    {},
                    "",
                    query ? `/manage?${query}` : "/manage",
                );
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamId]);

    useEffect(() => {
        if (member && teamId) {
            void loadData();
            void pf.checkHasPin().then(setTeamHasPin);
        }
    }, [member, teamId, loadData]);

    useEffect(() => {
        function handleAccessibilityChanged() {
            void loadData();
        }

        window.addEventListener(
            "accessibility:changed",
            handleAccessibilityChanged,
        );
        return () =>
            window.removeEventListener(
                "accessibility:changed",
                handleAccessibilityChanged,
            );
    }, [loadData]);

    const projNameOptions = useMemo(
        () =>
            projects
                .filter((p) => showArchived || !p.is_archived)
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((p) => ({ value: p.name, label: p.name })),
        [projects, showArchived],
    );

    const accTabProjFilterOptions = useMemo(
        () =>
            [...new Set(accessibility.map((a) => a.proj).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, "ko"))
                .map((p) => ({ value: p, label: p })),
        [accessibility],
    );

    const accModalProjOptions = useMemo(
        () =>
            projects
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((p) => ({ value: p.name, label: p.name })),
        [projects],
    );

    const accModalSelectStyles = useMemo(
        () => ({
            ...selectStyles,
            control: (
                base: Record<string, unknown>,
                state: { isFocused: boolean },
            ) => ({
                ...base,
                fontSize: "14px",
                borderColor: state.isFocused ? "#f59e0b" : "#e7e5e4",
                borderRadius: "8px",
                boxShadow: state.isFocused ? "0 0 0 2px #fde68a" : "none",
                "&:hover": { borderColor: "#d6d3d1" },
                minHeight: "42px",
                height: "42px",
            }),
            valueContainer: (base: Record<string, unknown>) => ({
                ...base,
                height: "42px",
                padding: "0 12px",
            }),
            indicatorsContainer: (base: Record<string, unknown>) => ({
                ...base,
                height: "42px",
            }),
            placeholder: (base: Record<string, unknown>) => ({
                ...base,
                fontSize: "14px",
            }),
        }),
        [],
    );

    function showToastMsg(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    }

    function closeProjModal() {
        setShowProjModal(false);
        setEditProj(null);
        setProjForm({ ...EMPTY_PROJ_FORM });
    }

    function openProjModalForAdd() {
        setEditProj(null);
        setProjForm({ ...EMPTY_PROJ_FORM });
        setModalDefs([]);
        setModalValues({});
        setSavedSecrets(new Set());
        setExtraFields(FIXED_FIELDS.map((f) => ({ key: f.key, label: f.label, fieldType: f.fieldType, isFixed: true })));
        setModalTab("basic");
        setShowProjModal(true);
    }

    async function openProjModalForEdit(p: Project) {
        setEditProj(p);
        setProjForm({
            name: p.name,
            client: p.client ?? "",
            members: [...getProjectMembers(p)],
            languages: p.language
                ? p.language
                      .split(",")
                      .map((s: string) => s.trim())
                      .filter(Boolean)
                : [],
            pm: p.pm ?? "",
            developer: p.developer ?? "",
            designer: p.designer ?? "",
            prev_member: p.prev_member ?? "",
            frequency: p.frequency ?? "",
            note: p.note ?? "",
        });
        // 기본 필드 ensure + 로드
        const [defs, vals] = await Promise.all([
            pf.ensureDefaultFields(p.id),
            pf.loadValues(p.id),
        ]);
        setModalDefs(defs);
        const valMap = new Map(vals.map((v) => [v.field_def_id, v]));

        // 시스템 필드 값 (접속 정보 + 개발 환경) → def name 기반
        // 기타 필드 값 → 고정(project 컬럼) + 커스텀
        const mv: Record<string, string> = {
            pm: p.pm ?? "",
            developer: p.developer ?? "",
            designer: p.designer ?? "",
            frequency: p.frequency ?? "",
            prev_member: p.prev_member ?? "",
            note: p.note ?? "",
        };
        const secrets = new Set<string>();
        for (const def of defs) {
            const fv = valMap.get(def.id);
            mv[def.name] = def.field_type === "secret" ? "" : (fv?.value ?? "");
            if (def.field_type === "secret" && fv?.has_secret) secrets.add(def.name);
        }
        setModalValues(mv);
        setSavedSecrets(secrets);

        // 기타 섹션: 고정 필드 + 비시스템 커스텀 필드
        const fixedItems = FIXED_FIELDS.map((f) => ({
            key: f.key, label: f.label, fieldType: f.fieldType, isFixed: true,
        }));
        const customExtras = filterExtraFields(defs).map((d) => ({
            key: d.name, label: d.label, fieldType: d.field_type, isFixed: false, defId: d.id,
        }));
        // field_order 반영
        const savedOrder = p.field_order ?? FIXED_FIELDS.map((f) => f.key);
        const allExtras = [...fixedItems, ...customExtras];
        const extraMap = new Map(allExtras.map((f) => [f.key, f]));
        const ordered: typeof allExtras = [];
        for (const key of savedOrder) {
            const item = extraMap.get(key);
            if (item) { ordered.push(item); extraMap.delete(key); }
        }
        for (const item of extraMap.values()) ordered.push(item);
        setExtraFields(ordered);
        setModalTab("basic");
        setShowProjModal(true);
    }

    function toggleProjMember(name: string) {
        setProjForm((prev) => ({
            ...prev,
            members: prev.members.includes(name)
                ? prev.members.filter((m) => m !== name)
                : [...prev.members, name],
        }));
    }

    function toggleProjLang(lang: string) {
        setProjForm((f) => ({
            ...f,
            languages: f.languages.includes(lang)
                ? f.languages.filter((l) => l !== lang)
                : [...f.languages, lang],
        }));
    }

    async function saveProject() {
        if (isGuest) return;
        if (!projForm.name.trim()) return alert("프로젝트명은 필수예요");
        if (!projForm.members.length)
            return alert("담당자를 1명 이상 선택해 주세요");

        const langStr =
            ["PHP", "JSP", "기타"]
                .filter((l) => projForm.languages.includes(l))
                .join(", ") || null;

        const payload = {
            name: projForm.name.trim(),
            client: projForm.client || null,
            members: projForm.members,
            member: projForm.members[0] || null,
            language: langStr,
            pm: modalValues.pm || null,
            developer: modalValues.developer || null,
            designer: modalValues.designer || null,
            frequency: modalValues.frequency || null,
            prev_member: modalValues.prev_member || null,
            note: modalValues.note || null,
            field_order: extraFields.map((f) => f.key),
        };

        let projectId: number | null = null;
        if (editProj) {
            const { error } = await supabase
                .from("projects")
                .update(payload)
                .eq("id", editProj.id);
            if (error) {
                alert("저장 실패: " + error.message);
                return;
            }
            projectId = editProj.id;
        } else {
            if (!teamId) return;
            const { data: inserted, error } = await supabase.from("projects").insert([{ ...payload, team_id: teamId }]).select("id").single();
            if (error) {
                alert("추가 실패: " + error.message);
                return;
            }
            projectId = inserted?.id ?? null;
        }
        // 고정 필드 변경 이력 기록
        if (editProj && teamId) {
            const fixedFieldLabels: Record<string, string> = {
                name: "프로젝트명", client: "고객사", pm: "PM",
                developer: "개발자", designer: "디자이너",
                frequency: "빈도", prev_member: "이전 담당자", note: "비고",
            };
            const oldVals: Record<string, string | null> = {
                name: editProj.name, client: editProj.client,
                pm: editProj.pm, developer: editProj.developer,
                designer: editProj.designer, frequency: editProj.frequency,
                prev_member: editProj.prev_member, note: editProj.note,
            };
            const newVals: Record<string, string | null> = {
                name: payload.name, client: payload.client,
                pm: payload.pm, developer: payload.developer,
                designer: payload.designer, frequency: payload.frequency,
                prev_member: payload.prev_member, note: payload.note,
            };
            const entries = Object.keys(fixedFieldLabels)
                .filter((k) => (oldVals[k] ?? "") !== (newVals[k] ?? ""))
                .map((k) => ({
                    field_label: fixedFieldLabels[k],
                    old_value: oldVals[k] || null,
                    new_value: newVals[k] || null,
                    action: oldVals[k] ? "update" : "create",
                }));
            if (entries.length > 0) {
                fetch("/api/project-fields/history", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ teamId, projectId, entries }),
                }).catch(() => {});
            }
        }
        // 커스텀 필드 값 저장 (시스템 필드 + 기타 커스텀, 변경 이력은 values API에서 자동 기록)
        if (projectId && modalDefs.length > 0) {
            const fields = modalDefs
                .map((def) => ({ field_def_id: def.id, value: modalValues[def.name]?.trim() || null }))
                .filter((f) => {
                    const def = modalDefs.find((d) => d.id === f.field_def_id);
                    if (def?.field_type === "secret" && !f.value) return false;
                    return true;
                });
            if (fields.length > 0) {
                await pf.saveValues(projectId, fields).catch(() => {});
            }
        }
        closeProjModal();
        await loadData();
    }

    function deleteProject(id: number) {
        if (isGuest) return;
        const proj = projects.find((p) => p.id === id);
        setDeleteTarget({
            type: "project",
            id,
            name: proj?.name ?? `프로젝트 #${id}`,
        });
    }

    function openAccModalForAdd() {
        setEditAcc(null);
        setShowAccStartPicker(false);
        setShowAccEndPicker(false);
        setAccForm({
            ...emptyAccForm,
            accMember: member || "",
        });
        setShowAccModal(true);
    }

    function openAccModalForEdit(a: Accessibility) {
        setEditAcc(a);
        setShowAccStartPicker(false);
        setShowAccEndPicker(false);
        const normalizedStatus =
            a.inspection_status === "미신청"
                ? "신청필요"
                : a.inspection_status === "갱신완료"
                  ? "취득·갱신완료"
                  : a.inspection_status;
        setAccForm({
            proj: a.proj,
            start_date: a.start_date ? a.start_date.slice(0, 10) : "",
            end_date: a.end_date ? a.end_date.slice(0, 10) : "",
            inspection_status: normalizedStatus,
            note: a.note ?? "",
            accMember: a.member,
            is_new: a.is_new ?? false,
        });
        setShowAccModal(true);
    }

    function closeAccModal() {
        setShowAccModal(false);
        setEditAcc(null);
        setShowAccStartPicker(false);
        setShowAccEndPicker(false);
        setAccForm({ ...emptyAccForm });
    }

    async function saveAccessibility() {
        if (!accForm.proj) return alert("프로젝트명은 필수예요");
        if (isGuest) return;
        const selectedProjectId = findProjectId(projects, accForm.proj);
        if (selectedProjectId === null) {
            showToastMsg("현재 팀의 프로젝트를 다시 선택해주세요");
            return;
        }

        if (editAcc) {
            const selectedPlayerId =
                editAcc.player_id ??
                findTeamMemberId(memberOptions, editAcc.member);
            if (selectedPlayerId === null) {
                showToastMsg("현재 팀의 담당자를 다시 선택해주세요");
                return;
            }
            const canChangeStatus = await prepareAccStatusTransition(
                editAcc,
                accForm.inspection_status,
            );
            if (!canChangeStatus) return;
            const { error } = await supabase
                .from("accessibility")
                .update({
                    proj: accForm.proj,
                    project_id: selectedProjectId,
                    player_id: selectedPlayerId,
                    start_date: accForm.start_date || null,
                    end_date: accForm.end_date || null,
                    inspection_status: accForm.inspection_status,
                    ...accStatusAuditPayload(
                        editAcc,
                        accForm.inspection_status,
                        member,
                    ),
                    note: accForm.note || null,
                    is_new: accForm.is_new,
                })
                .eq("team_id", teamId)
                .eq("id", editAcc.id);
            if (error) {
                showToastMsg("저장 실패: " + error.message);
                return;
            }
        } else {
            const assignee =
                role === "admin" ? accForm.accMember : member ?? "";
            const selectedPlayerId = findTeamMemberId(
                memberOptions,
                assignee,
            );
            if (selectedPlayerId === null) {
                showToastMsg("현재 팀의 담당자를 다시 선택해주세요");
                return;
            }
            const { error } = await supabase.from("accessibility").insert([
                {
                    proj: accForm.proj,
                    project_id: selectedProjectId,
                    member: assignee,
                    player_id: selectedPlayerId,
                    start_date: accForm.start_date || null,
                    end_date: accForm.end_date || null,
                    note: accForm.note || null,
                    inspection_status: accForm.inspection_status || "신청필요",
                    previous_inspection_status: null,
                    status_updated_at: new Date().toISOString(),
                    status_updated_by: member ?? null,
                    is_new: accForm.is_new,
                    team_id: teamId,
                },
            ]);
            if (error) {
                showToastMsg("등록 실패: " + error.message);
                return;
            }
        }
        closeAccModal();
        await loadData();
        notifyAccessibilityChanged();
    }

    async function prepareAccStatusTransition(
        row: Accessibility,
        nextStatus: string,
    ) {
        if (row.inspection_status === nextStatus) return true;
        if (nextStatus === "신청필요") {
            const res = await fetch("/api/accessibility-mission-snoozes", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    teamId,
                    accessibilityId: row.id,
                    keys: [
                        ...accMissionSnoozeKeys(row, "신청필요", "apply"),
                        ...accMissionSnoozeKeys(
                            row,
                            "신청필요",
                            "missing_schedule",
                        ),
                    ],
                }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                showToastMsg(
                    json.message || "접근성 미션 다시 알림 해제에 실패했어요",
                );
                return false;
            }
        }
        if (nextStatus === "취득·갱신완료") {
            const res = await fetch("/api/accessibility-mission-snoozes", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    teamId,
                    accessibilityId: row.id,
                    keys: accMissionSnoozeKeys(
                        row,
                        "취득·갱신완료",
                        "renewal",
                    ),
                }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                showToastMsg(
                    json.message || "접근성 미션 다시 알림 해제에 실패했어요",
                );
                return false;
            }
        }
        if (nextStatus === "신청완료") {
            const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
            // eslint-disable-next-line react-hooks/purity -- 이벤트 핸들러 내부 호출
            const snoozedUntil = new Date(Date.now() + TWO_WEEKS_MS).toISOString();
            const res = await fetch("/api/accessibility-mission-snoozes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    teamId,
                    accessibilityId: row.id,
                    keys: [`${row.id}:신청완료:result`],
                    snoozedUntil,
                }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                showToastMsg(
                    json.message || "접근성 미션 다시 알림 저장에 실패했어요",
                );
                return false;
            }
        }
        return true;
    }

    async function updateAccStatus(id: number, status: string) {
        const row = accessibility.find((a) => a.id === id);
        if (!row) return;
        const can = !isGuest;
        if (!can) return;
        const canChangeStatus = await prepareAccStatusTransition(row, status);
        if (!canChangeStatus) return;
        const { error } = await supabase
            .from("accessibility")
            .update({
                inspection_status: status,
                ...accStatusAuditPayload(row, status, member),
            })
            .eq("team_id", teamId)
            .eq("id", id);
        if (error) {
            showToastMsg(error.message || "상태 변경에 실패했어요");
            return;
        }
        await loadData();
        notifyAccessibilityChanged();
    }

    function deleteAcc(id: number) {
        const row = accessibility.find((a) => a.id === id);
        if (!row) return;
        if (isGuest) return;
        setDeleteTarget({
            type: "accessibility",
            id,
            name: row.proj ?? `접근성 #${id}`,
        });
    }

    async function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            // Supabase는 실패 시 throw 대신 { error }를 반환하므로 명시적으로 확인한다
            if (deleteTarget.type === "project") {
                const { error } = await supabase
                    .from("projects")
                    .delete()
                    .eq("id", deleteTarget.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("accessibility")
                    .delete()
                    .eq("id", deleteTarget.id);
                if (error) throw error;
                notifyAccessibilityChanged();
            }
            setDeleteTarget(null);
            await loadData();
        } catch {
            showToastMsg("삭제에 실패했습니다.");
        } finally {
            setDeleting(false);
        }
    }

    async function toggleArchive(id: number, current: boolean) {
        const { error } = await supabase
            .from("projects")
            .update({ is_archived: !current })
            .eq("id", id);
        if (error) {
            showToastMsg(current ? "보관 해제에 실패했습니다." : "보관에 실패했습니다.");
            return;
        }
        await loadData();
    }

    const filteredProjects = projects
        .filter((p) => {
            if (!showArchived && p.is_archived) return false;
            const q = searchProj.trim();
            const matchSearch =
                !q || p.name.toLowerCase().includes(q.toLowerCase());
            const matchMember =
                !filterProjMember ||
                p.member === filterProjMember ||
                (p.members || []).includes(filterProjMember);
            const langUpper = (p.language || "").toUpperCase();
            const matchLang = !filterProjLang
                ? true
                : filterProjLang === "기타"
                  ? !["PHP", "JSP"].some((l) => langUpper.includes(l))
                  : langUpper.includes(filterProjLang.toUpperCase());
            return matchSearch && matchMember && matchLang;
        })
        .sort((a, b) => {
            if (sortProj === "담당자") {
                const ma = a.member || "";
                const mb = b.member || "";
                return (
                    ma.localeCompare(mb, "ko") ||
                    a.name.localeCompare(b.name, "ko")
                );
            }
            return a.name.localeCompare(b.name, "ko");
        });

    const filteredAcc = accessibility
        .filter((a) => {
            const q = searchAcc.trim();
            const matchSearch =
                !q || a.proj.toLowerCase().includes(q.toLowerCase());
            const matchMember =
                !filterAccMember || a.member === filterAccMember;
            const matchStatus =
                !filterAccStatus || a.inspection_status === filterAccStatus;
            return matchSearch && matchMember && matchStatus;
        })
        .sort((a, b) => {
            if (sortAcc === "날짜순") {
                if (!a.end_date) return 1;
                if (!b.end_date) return -1;
                return a.end_date.localeCompare(b.end_date);
            }
            if (sortAcc === "담당자순") {
                return (a.member || "").localeCompare(b.member || "", "ko");
            }
            return (a.proj || "").localeCompare(b.proj || "", "ko");
        });

    const canEditRowAcc = () => !isGuest;

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f7f6f3] pb-24">
                <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                    <div className="max-w-2xl mx-auto flex justify-between items-center gap-2">
                        <h1 className="text-base font-bold text-stone-900 shrink-0">
                            관리
                        </h1>
                        <div className="flex items-center gap-2 shrink-0">
                            <TeamSwitcher />
                            {manageTab === "project" && !isGuest && (
                                <button
                                    type="button"
                                    onClick={openProjModalForAdd}
                                    className="bg-amber-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                                >
                                    + 프로젝트 추가
                                </button>
                            )}
                            {manageTab === "accessibility" && !isGuest && (
                                <button
                                    type="button"
                                    onClick={openAccModalForAdd}
                                    className="bg-amber-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                                >
                                    + 접근성 추가
                                </button>
                            )}
                            <NotificationButton />
                            <UserMenu />
                        </div>
                    </div>
                </div>

                <div className="max-w-2xl mx-auto px-4 pt-4">
                    <div className="flex bg-white rounded-lg p-0.5 mb-4">
                        <button
                            type="button"
                            onClick={() => setManageTab("project")}
                            className={`flex-1 py-2 text-xs font-medium rounded-md transition-all
                ${manageTab === "project" ? "bg-amber-500 text-white shadow-sm" : "text-stone-400 hover:text-stone-600"}`}
                        >
                            프로젝트
                        </button>
                        <button
                            type="button"
                            onClick={() => setManageTab("accessibility")}
                            className={`flex-1 py-2 text-xs font-medium rounded-md transition-all
                ${manageTab === "accessibility" ? "bg-amber-500 text-white shadow-sm" : "text-stone-400 hover:text-stone-600"}`}
                        >
                            접근성
                        </button>
                    </div>

                    {loading ? (
                        <PageSpinner />
                    ) : loadError ? (
                        <div className="mx-4 mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-center">
                            <p className="text-sm text-red-700">{loadError}</p>
                            <button
                                type="button"
                                className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                                onClick={() => void loadData()}
                            >
                                다시 시도
                            </button>
                        </div>
                    ) : manageTab === "project" ? (
                        <div>
                            {/* 검색 */}
                            <div className="relative text-xs mb-2">
                                <Select
                                    aria-label="프로젝트명 검색"
                                    options={projNameOptions}
                                    value={searchProj ? { value: searchProj, label: searchProj } : null}
                                    onChange={(opt) => setSearchProj(opt?.value ?? "")}
                                    placeholder="프로젝트 검색"
                                    isClearable
                                    isSearchable
                                    styles={taskFilterProjectSelectStyles}
                                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                                    noOptionsMessage={() => "검색 결과가 없어요"}
                                />
                            </div>
                            {/* 칩 필터 */}
                            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                                <FilterChip
                                    label={sortProj === "가나다" ? "가나다순" : "담당자순"}
                                    active
                                    options={[
                                        { value: "가나다", label: "가나다순" },
                                        { value: "담당자", label: "담당자순" },
                                    ]}
                                    onSelect={(v) => setSortProj(v as "가나다" | "담당자")}
                                />
                                <FilterChip
                                    label={filterProjLang || "언어"}
                                    active={Boolean(filterProjLang)}
                                    options={[
                                        { value: "", label: "전체" },
                                        { value: "JSP", label: "JSP" },
                                        { value: "PHP", label: "PHP" },
                                        { value: "기타", label: "기타" },
                                    ]}
                                    onSelect={(v) => setFilterProjLang(v)}
                                />
                                <FilterChip
                                    label={filterProjMember || "담당자"}
                                    active={Boolean(filterProjMember)}
                                    options={[
                                        { value: "", label: "전체" },
                                        ...members.map((m) => ({ value: m, label: m })),
                                    ]}
                                    onSelect={(v) => setFilterProjMember(v)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowArchived((v) => !v)}
                                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                        showArchived ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                                    }`}
                                >
                                    보관함{!showArchived && ` ${projects.filter((p) => p.is_archived).length}`}
                                </button>
                                <span className="text-xs text-stone-400 ml-auto">{filteredProjects.length}개</span>
                                {/* 더보기 */}
                                {(MAINTENANCE_STATUS_URL || teamId === "ud2") && (
                                    <div className="relative">
                                        <button type="button" onClick={() => setShowMoreMenu((v) => !v)} className="rounded-full bg-stone-100 p-1.5 text-stone-400 hover:bg-stone-200 transition-colors" aria-label="더보기">
                                            <i className="ri-more-2-fill text-xs" aria-hidden />
                                        </button>
                                        {showMoreMenu && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                                                <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-stone-200 bg-white shadow-lg py-1">
                                                    {MAINTENANCE_STATUS_URL && (
                                                        <a href={MAINTENANCE_STATUS_URL} target="_blank" rel="noopener noreferrer" onClick={() => setShowMoreMenu(false)} className="flex items-center gap-2 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50">
                                                            <i className="ri-bar-chart-line" aria-hidden />유지보수 현황 <i className="ri-external-link-line text-stone-400 ml-auto" aria-hidden />
                                                        </a>
                                                    )}
                                                    {teamId === "ud2" && (
                                                        <a href="https://docs.google.com/spreadsheets/d/1ACScLXCcap3Vvz9eH7sXX0yOcZKcV8blH53h6C63ObE/edit?gid=1191028141#gid=1191028141" target="_blank" rel="noopener noreferrer" onClick={() => setShowMoreMenu(false)} className="flex items-center gap-2 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50">
                                                            <i className="ri-file-excel-line" aria-hidden />퍼블팀 통합 유지보수 엑셀 <i className="ri-external-link-line text-stone-400 ml-auto" aria-hidden />
                                                        </a>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                            {projects.length === 0 ? (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                    <p className="text-xs text-stone-400 text-center py-6">
                                        프로젝트가 없어요
                                    </p>
                                </div>
                            ) : filteredProjects.length === 0 ? (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                    <p className="text-xs text-stone-400 text-center py-6">
                                        조건에 맞는 프로젝트가 없어요
                                    </p>
                                </div>
                            ) : (
                                filteredProjects.map((p) => {
                                    const isOpen = !!expandedProj[p.id];
                                    const projMembers =
                                        p.members?.length > 0
                                            ? p.members
                                            : p.member
                                              ? [p.member]
                                              : [];
                                    return (
                                        <div
                                            key={p.id}
                                            className={`bg-white rounded-xl border border-stone-200 overflow-hidden mb-2
    ${p.is_archived ? "opacity-50" : ""}`}
                                        >
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                aria-expanded={isOpen}
                                                onClick={() =>
                                                    setExpandedProj((e) => ({
                                                        ...e,
                                                        [p.id]: !e[p.id],
                                                    }))
                                                }
                                                onKeyDown={(e) => {
                                                    if (
                                                        e.key === "Enter" ||
                                                        e.key === " "
                                                    ) {
                                                        e.preventDefault();
                                                        setExpandedProj(
                                                            (prev) => ({
                                                                ...prev,
                                                                [p.id]: !prev[
                                                                    p.id
                                                                ],
                                                            }),
                                                        );
                                                    }
                                                }}
                                                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50/80"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {p.language && (
                                                            <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-500">
                                                                {p.language}
                                                            </span>
                                                        )}
                                                        <span className="truncate text-sm font-medium text-stone-800">
                                                            {p.name}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    {projMembers
                                                        .slice(0, 3)
                                                        .map((m) => (
                                                            <Avatar
                                                                key={m}
                                                                name={m}
                                                                size={20}
                                                            />
                                                        ))}
                                                    {isOpen ? (
                                                        <i
                                                            className="ri-arrow-up-s-line text-stone-400"
                                                            aria-hidden
                                                        />
                                                    ) : (
                                                        <i
                                                            className="ri-arrow-down-s-line text-stone-400"
                                                            aria-hidden
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                            {isOpen && (
                                                <ProjectDetailTabs
                                                    project={p}
                                                    projMembers={projMembers}
                                                    pf={pf}
                                                    isGuest={isGuest}
                                                    onEdit={() => openProjModalForEdit(p)}
                                                    onDelete={() => void deleteProject(p.id)}
                                                    onArchive={() => void toggleArchive(p.id, p.is_archived ?? false)}
                                                    onHistory={() => setHistoryProjectId(p.id)}
                                                    hasPin={teamHasPin}
                                                    pinVerified={pinVerified}
                                                    onPinRequired={(cb) => { setPinModal({ callback: cb }); setPinInput(""); setPinError(false); }}
                                                />
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        <div>
                            <div className="flex flex-wrap gap-2 mb-2">
                                <div className="relative min-w-0 flex-1 text-xs">
                                    <Select
                                        aria-label="프로젝트명 검색"
                                        options={accTabProjFilterOptions}
                                        value={
                                            searchAcc
                                                ? {
                                                      value: searchAcc,
                                                      label: searchAcc,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setSearchAcc(opt?.value ?? "")
                                        }
                                        placeholder="프로젝트 선택"
                                        isClearable
                                        isSearchable
                                        styles={taskFilterProjectSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                        noOptionsMessage={() =>
                                            "검색 결과가 없어요"
                                        }
                                    />
                                </div>
                                <div className="min-w-0 shrink">
                                    <Select
                                        aria-label="담당자 필터"
                                        options={members.map((m) => ({
                                            value: m,
                                            label: m,
                                        }))}
                                        value={
                                            filterAccMember
                                                ? {
                                                      value: filterAccMember,
                                                      label: filterAccMember,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setFilterAccMember(
                                                opt?.value ?? "",
                                            )
                                        }
                                        placeholder="전체 담당자"
                                        isClearable
                                        isSearchable={false}
                                        styles={taskFilterProjectSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                    />
                                </div>
                                <div className="min-w-0 shrink">
                                    <Select
                                        aria-label="점검 상태 필터"
                                        options={[
                                            {
                                                value: "신청필요",
                                                label: "신청필요",
                                            },
                                            {
                                                value: "신청완료",
                                                label: "신청완료",
                                            },
                                            {
                                                value: "취득·갱신완료",
                                                label: "취득·갱신완료",
                                            },
                                            {
                                                value: "신청불필요",
                                                label: "신청불필요",
                                            },
                                        ]}
                                        value={
                                            filterAccStatus
                                                ? {
                                                      value: filterAccStatus,
                                                      label: filterAccStatus,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setFilterAccStatus(
                                                opt?.value ?? "",
                                            )
                                        }
                                        placeholder="전체 상태"
                                        isClearable
                                        isSearchable={false}
                                        styles={taskFilterProjectSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                    />
                                </div>
                            </div>
                            <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-stone-600">
                                <p className="font-bold text-stone-800">
                                    접근성 미션 알림 기준
                                </p>
                                <ul className="mt-2 list-disc space-y-1 pl-5">
                                    <li>
                                        취득·갱신완료 상태에서 만료 D-45가 되면 신청필요로 바꾸라고 안내합니다.
                                    </li>
                                    <li>
                                        신청필요 상태가 되면 신청을 진행했는지 확인하고, 신청완료로 변경하라고 안내합니다.
                                    </li>
                                    <li>
                                        신청완료로 변경한 뒤 14일 후 취득·갱신완료 처리와 만료일 업데이트를 안내합니다.
                                    </li>
                                    <li className="text-stone-500">
                                        7일 뒤 다시 알림은 선택한 접근성 항목에만 적용됩니다.
                                    </li>
                                </ul>
                            </div>
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-xs text-stone-400">
                                    총 {filteredAcc.length}개
                                </span>
                                <div className="min-w-[7rem]">
                                    <Select
                                        aria-label="접근성 정렬"
                                        options={[
                                            { value: "날짜순", label: "날짜순" },
                                            { value: "가나다순", label: "가나다순" },
                                            { value: "담당자순", label: "담당자순" },
                                        ]}
                                        value={{
                                            value: sortAcc,
                                            label: sortAcc,
                                        }}
                                        onChange={(opt) => {
                                            if (!opt) return;
                                            setSortAcc(
                                                opt.value as
                                                    | "날짜순"
                                                    | "가나다순"
                                                    | "담당자순",
                                            );
                                        }}
                                        isSearchable={false}
                                        isClearable={false}
                                        styles={taskFilterProjectSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                    />
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                {accessibility.length === 0 ? (
                                    <p className="text-xs text-stone-400 text-center py-6">
                                        등록된 항목이 없어요
                                    </p>
                                ) : filteredAcc.length === 0 ? (
                                    <p className="text-xs text-stone-400 text-center py-6">
                                        조건에 맞는 항목이 없어요
                                    </p>
                                ) : (
                                    filteredAcc.map((a, i) => {
                                        const diff = getDiff(a.end_date);
                                        const isUrgent =
                                            diff !== null &&
                                            diff <= 14 &&
                                            a.inspection_status === "신청필요";
                                        const isWarning =
                                            diff !== null &&
                                            diff > 14 &&
                                            diff <= 45 &&
                                            a.inspection_status === "신청필요";
                                        const isSkipped =
                                            a.inspection_status ===
                                            "신청불필요";
                                        const isDueWithin45 =
                                            diff !== null &&
                                            diff <= 45 &&
                                            !isSkipped;
                                        const canRow = canEditRowAcc();
                                        return (
                                            <div
                                                key={a.id}
                                                role={canRow ? "button" : undefined}
                                                tabIndex={canRow ? 0 : undefined}
                                                className={`px-4 py-3 transition-colors
                      ${isSkipped ? "bg-stone-50 opacity-70" : isUrgent ? "bg-red-50" : isWarning ? "bg-amber-50" : ""}
                      ${i < filteredAcc.length - 1 ? "border-b border-stone-100" : ""}
                      ${canRow ? "cursor-pointer hover:bg-stone-50/60" : ""}`}
                                                onClick={() => canRow && openAccModalForEdit(a)}
                                                onKeyDown={(e) => {
                                                    if (canRow && (e.key === "Enter" || e.key === " ")) {
                                                        e.preventDefault();
                                                        openAccModalForEdit(a);
                                                    }
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Avatar name={a.member} size={24} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {a.is_new && (
                                                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-bold shrink-0">NEW</span>
                                                            )}
                                                            <p className="text-sm font-medium text-stone-800 truncate">{a.proj}</p>
                                                        </div>
                                                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-stone-400">
                                                            <i className="ri-history-line text-xs" aria-hidden />
                                                            <span className="min-w-0 truncate">
                                                                {a.status_updated_at
                                                                    ? `상태 변경: ${a.previous_inspection_status ? `${a.previous_inspection_status} → ` : ""}${a.inspection_status} · ${formatAccStatusUpdatedAt(a.status_updated_at)}${a.status_updated_by ? ` · ${a.status_updated_by}` : ""}`
                                                                    : `상태 기록 없음 · 현재 ${a.inspection_status}`}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 flex w-full items-center justify-between text-xs text-stone-400">
                                                            <div className="flex items-center gap-2">
                                                                {a.end_date && (
                                                                    <span className={isDueWithin45 ? "text-red-500 font-bold" : ""}>
                                                                        만료: {a.end_date.slice(0, 10)}
                                                                        {diff !== null && ` (${diff < 0 ? "기한초과 " + Math.abs(diff) + "일" : "D-" + diff})`}
                                                                    </span>
                                                                )}
                                                                {a.note && <span className="truncate">· {a.note}</span>}
                                                            </div>
                                                            <div className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                                                <AccInspectionBadgeSelect
                                                                    status={a.inspection_status}
                                                                    disabled={!canRow}
                                                                    onChange={(next) => void updateAccStatus(a.id, next)}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* 프로젝트 추가·수정 모달 */}
                {showProjModal && (
                    <div
                        className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
                        style={{ marginBottom: "var(--nav-height)" }}
                        onClick={closeProjModal}
                    >
                        <div
                            className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-5">
                                <h2 className="text-base font-bold">
                                    {editProj
                                        ? "프로젝트 수정"
                                        : "프로젝트 추가"}
                                </h2>
                                <button
                                    type="button"
                                    onClick={closeProjModal}
                                    className="text-2xl text-stone-400 leading-none"
                                    aria-label="닫기"
                                >
                                    ×
                                </button>
                            </div>
                            <div>
                                {/* 모달 탭 */}
                                <div className="flex rounded-lg bg-stone-100 p-0.5 mb-4">
                                    <button type="button" onClick={() => setModalTab("basic")} className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${modalTab === "basic" ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600"}`}>기본 정보</button>
                                    <button type="button" onClick={() => {
                                        if (teamHasPin && !pinVerified) {
                                            setPinModal({ callback: () => setModalTab("setting") });
                                            setPinInput("");
                                            setPinError(false);
                                        } else {
                                            setModalTab("setting");
                                        }
                                    }} className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${modalTab === "setting" ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600"}`}>
                                        세팅 정보{teamHasPin && <i className="ri-lock-line text-[10px] ml-1" aria-hidden />}
                                    </button>
                                </div>

                                {/* 기본 정보 탭 */}
                                {modalTab === "basic" && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs font-medium text-stone-500 block mb-1.5">담당자 (복수 선택)</label>
                                            <div className="grid grid-cols-4 gap-2">
                                                {members.map((name) => {
                                                    const on = projForm.members.includes(name);
                                                    return (
                                                        <button key={name} type="button" onClick={() => toggleProjMember(name)} className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition-colors ${on ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-stone-50"}`}>
                                                            <Avatar name={name} size={32} />
                                                            <span className="text-[10px] text-stone-600">{name.slice(1)}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-stone-500 block mb-1.5">프로젝트명 <span className="text-red-500">*</span></label>
                                            <input className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm" placeholder="예) 사이버견본주택" value={projForm.name} onChange={(e) => setProjForm({ ...projForm, name: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-stone-500 block mb-1.5">고객사</label>
                                            <input className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm" placeholder="예) GS건설" value={projForm.client} onChange={(e) => setProjForm({ ...projForm, client: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-stone-500 block mb-1.5">언어</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {PROJ_LANG_OPTIONS.map((lang) => {
                                                    const on = projForm.languages.includes(lang);
                                                    return (
                                                        <button key={lang} type="button" onClick={() => toggleProjLang(lang)} className={`rounded-xl border-2 py-2.5 text-sm font-medium transition-colors ${on ? "border-amber-500 bg-amber-50 text-stone-800" : "border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300"}`}>{lang}</button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <ExtraSection
                                            fields={extraFields}
                                            values={modalValues}
                                            onChange={(k, v) => setModalValues((prev) => ({ ...prev, [k]: v }))}
                                            savedSecrets={savedSecrets}
                                            onReorder={setExtraFields}
                                            onDelete={async (field) => {
                                                if (field.defId) await pf.deleteDef(field.defId);
                                                setExtraFields((prev) => prev.filter((f) => f.key !== field.key));
                                                setModalValues((prev) => { const next = { ...prev }; delete next[field.key]; return next; });
                                            }}
                                            onAdd={async (label, fieldType) => {
                                                if (!editProj) return;
                                                setCfSaving(true);
                                                try {
                                                    await pf.addDef(editProj.id, label, fieldType);
                                                    const fresh = await pf.loadDefs(editProj.id);
                                                    setModalDefs(fresh);
                                                    const added = filterExtraFields(fresh).find((d) => !extraFields.some((ef) => ef.defId === d.id));
                                                    if (added) {
                                                        setExtraFields((prev) => [...prev, { key: added.name, label: added.label, fieldType: added.field_type, isFixed: false, defId: added.id }]);
                                                        setModalValues((prev) => ({ ...prev, [added.name]: "" }));
                                                    }
                                                } finally { setCfSaving(false); }
                                            }}
                                            adding={cfSaving}
                                        />
                                    </div>
                                )}

                                {/* 세팅 정보 탭 */}
                                {modalTab === "setting" && (
                                    <div className="space-y-4">
                                        <AccessSection
                                            defs={modalDefs}
                                            values={modalValues}
                                            onChange={(k, v) => setModalValues((prev) => ({ ...prev, [k]: v }))}
                                            savedSecrets={savedSecrets}
                                            onAddField={async (label, fieldType, namePrefix) => {
                                                if (!editProj) return;
                                                const slug = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_가-힣]/g, "");
                                                const name = `${namePrefix}${slug || `custom_${Date.now()}`}`;
                                                await pf.addDef(editProj.id, label, fieldType, name);
                                                const fresh = await pf.loadDefs(editProj.id);
                                                setModalDefs(fresh);
                                                const added = fresh.find((d) => d.name === name);
                                                if (added) setModalValues((prev) => ({ ...prev, [added.name]: "" }));
                                            }}
                                            onDeleteField={async (defId) => {
                                                await pf.deleteDef(defId);
                                                setModalDefs((prev) => prev.filter((d) => d.id !== defId));
                                            }}
                                            onRenameField={async (defId, newLabel) => {
                                                await pf.updateDef(defId, { label: newLabel } as import("./useProjectFields").FieldDef);
                                                setModalDefs((prev) => prev.map((d) => d.id === defId ? { ...d, label: newLabel } : d));
                                            }}
                                            onReorderFields={async (reorder) => {
                                                await pf.reorderDefs(reorder);
                                                setModalDefs((prev) => prev.map((d) => { const r = reorder.find((x) => x.id === d.id); return r ? { ...d, sort_order: r.sort_order } : d; }));
                                            }}
                                        />
                                        <DevSection
                                            defs={modalDefs}
                                            values={modalValues}
                                            onChange={(k, v) => setModalValues((prev) => ({ ...prev, [k]: v }))}
                                            onAddField={async (label, fieldType, namePrefix) => {
                                                if (!editProj) return;
                                                const slug = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_가-힣]/g, "");
                                                const name = `${namePrefix}${slug || `custom_${Date.now()}`}`;
                                                await pf.addDef(editProj.id, label, fieldType, name);
                                                const fresh = await pf.loadDefs(editProj.id);
                                                setModalDefs(fresh);
                                                const added = fresh.find((d) => d.name === name);
                                                if (added) setModalValues((prev) => ({ ...prev, [added.name]: "" }));
                                            }}
                                            onDeleteField={async (defId) => {
                                                await pf.deleteDef(defId);
                                                setModalDefs((prev) => prev.filter((d) => d.id !== defId));
                                            }}
                                            onRenameField={async (defId, newLabel) => {
                                                await pf.updateDef(defId, { label: newLabel } as import("./useProjectFields").FieldDef);
                                                setModalDefs((prev) => prev.map((d) => d.id === defId ? { ...d, label: newLabel } : d));
                                            }}
                                            onReorderFields={async (reorder) => {
                                                await pf.reorderDefs(reorder);
                                                setModalDefs((prev) => prev.map((d) => { const r = reorder.find((x) => x.id === d.id); return r ? { ...d, sort_order: r.sort_order } : d; }));
                                            }}
                                        />
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => void saveProject()}
                                    className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm mt-4"
                                >
                                    {editProj ? "저장하기" : "추가하기"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 접근성 추가·수정 모달 */}
                {showAccModal && (
                    <div
                        className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
                        style={{ marginBottom: "var(--nav-height)" }}
                        onClick={closeAccModal}
                    >
                        <div
                            className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-5">
                                <h2 className="text-base font-bold">
                                    {editAcc ? "접근성 수정" : "접근성 추가"}
                                </h2>
                                <button
                                    type="button"
                                    onClick={closeAccModal}
                                    className="text-2xl text-stone-400 leading-none"
                                    aria-label="닫기"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="space-y-4">
                                {!editAcc && isAdmin && (
                                    <div>
                                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                            담당자
                                        </label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {members.map((name) => {
                                                const on =
                                                    accForm.accMember === name;
                                                return (
                                                    <button
                                                        key={name}
                                                        type="button"
                                                        onClick={() =>
                                                            setAccForm((f) => ({
                                                                ...f,
                                                                accMember: name,
                                                            }))
                                                        }
                                                        className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition-colors
                          ${on ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-stone-50"}`}
                                                    >
                                                        <Avatar
                                                            name={name}
                                                            size={32}
                                                        />
                                                        <span className="text-[10px] text-stone-600">
                                                            {name.slice(1)}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {!editAcc && !isAdmin && !isGuest && (
                                    <p className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
                                        본인 프로젝트로 등록돼요 (담당자:{" "}
                                        {member})
                                    </p>
                                )}
                                {editAcc && (
                                    <p className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
                                        담당자: {editAcc.member}
                                    </p>
                                )}
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        프로젝트명{" "}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <Select
                                        options={accModalProjOptions}
                                        value={
                                            accForm.proj
                                                ? {
                                                      value: accForm.proj,
                                                      label: accForm.proj,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setAccForm((f) => ({
                                                ...f,
                                                proj: opt?.value ?? "",
                                            }))
                                        }
                                        placeholder="프로젝트 검색"
                                        isSearchable
                                        styles={accModalSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                        noOptionsMessage={() =>
                                            "검색 결과가 없어요"
                                        }
                                    />
                                </div>
                                <div className="relative z-20">
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        인증 시작일
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAccEndPicker(false);
                                            setShowAccStartPicker((o) => !o);
                                        }}
                                        className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-all
                      ${showAccStartPicker ? "border-amber-300 ring-2 ring-amber-200" : "border-stone-200 hover:border-stone-300"}`}
                                    >
                                        <span
                                            className={
                                                accForm.start_date
                                                    ? "text-stone-800"
                                                    : "text-stone-400"
                                            }
                                        >
                                            {accForm.start_date
                                                ? (() => {
                                                      const d = new Date(
                                                          accForm.start_date +
                                                              "T00:00:00",
                                                      );
                                                      return `${d.getMonth() + 1}/${d.getDate()}`;
                                                  })()
                                                : "시작일 선택"}
                                        </span>
                                    </button>
                                    {showAccStartPicker &&
                                        typeof document !== "undefined" &&
                                        createPortal(
                                            <div
                                                className="fixed inset-0 z-[200] bg-black/30"
                                                onClick={() =>
                                                    setShowAccStartPicker(false)
                                                }
                                                role="presentation"
                                            >
                                                <div
                                                    className="absolute left-1/2 w-[min(calc(100vw-2rem),36rem)] -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-2xl"
                                                    style={{
                                                        bottom: "max(5.5rem, calc(var(--nav-height, 67px) + 3.5rem))",
                                                    }}
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <div className="flex justify-center overflow-x-auto">
                                                        <DayPicker
                                                            mode="single"
                                                            selected={
                                                                accForm.start_date
                                                                    ? new Date(
                                                                          accForm.start_date +
                                                                              "T00:00:00",
                                                                      )
                                                                    : undefined
                                                            }
                                                            onSelect={(d) => {
                                                                setAccForm(
                                                                    (f) => ({
                                                                        ...f,
                                                                        start_date:
                                                                            d
                                                                                ? toLocalYmd(
                                                                                      d,
                                                                                  )
                                                                                : "",
                                                                    }),
                                                                );
                                                            }}
                                                            locale={ko}
                                                            hideNavigation
                                                            components={{
                                                                MonthCaption:
                                                                    DatePickerCaption,
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="mt-3 flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setAccForm(
                                                                    (f) => ({
                                                                        ...f,
                                                                        start_date:
                                                                            "",
                                                                    }),
                                                                )
                                                            }
                                                            className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                                        >
                                                            초기화
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setShowAccStartPicker(
                                                                    false,
                                                                )
                                                            }
                                                            className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-bold text-white hover:bg-amber-600"
                                                        >
                                                            적용
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>,
                                            document.body,
                                        )}
                                </div>
                                <div className="relative z-20">
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        인증 만료일
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAccStartPicker(false);
                                            setShowAccEndPicker((o) => !o);
                                        }}
                                        className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-all
                      ${showAccEndPicker ? "border-amber-300 ring-2 ring-amber-200" : "border-stone-200 hover:border-stone-300"}`}
                                    >
                                        <span
                                            className={
                                                accForm.end_date
                                                    ? "text-stone-800"
                                                    : "text-stone-400"
                                            }
                                        >
                                            {accForm.end_date
                                                ? (() => {
                                                      const d = new Date(
                                                          accForm.end_date +
                                                              "T00:00:00",
                                                      );
                                                      return `${d.getMonth() + 1}/${d.getDate()}`;
                                                  })()
                                                : "만료일 선택"}
                                        </span>
                                    </button>
                                    {showAccEndPicker &&
                                        typeof document !== "undefined" &&
                                        createPortal(
                                            <div
                                                className="fixed inset-0 z-[200] bg-black/30"
                                                onClick={() =>
                                                    setShowAccEndPicker(false)
                                                }
                                                role="presentation"
                                            >
                                                <div
                                                    className="absolute left-1/2 w-[min(calc(100vw-2rem),36rem)] -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-2xl"
                                                    style={{
                                                        bottom: "max(5.5rem, calc(var(--nav-height, 67px) + 3.5rem))",
                                                    }}
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <div className="flex justify-center overflow-x-auto">
                                                        <DayPicker
                                                            mode="single"
                                                            selected={
                                                                accForm.end_date
                                                                    ? new Date(
                                                                          accForm.end_date +
                                                                              "T00:00:00",
                                                                      )
                                                                    : undefined
                                                            }
                                                            onSelect={(d) => {
                                                                setAccForm(
                                                                    (f) => ({
                                                                        ...f,
                                                                        end_date:
                                                                            d
                                                                                ? toLocalYmd(
                                                                                      d,
                                                                                  )
                                                                                : "",
                                                                    }),
                                                                );
                                                            }}
                                                            locale={ko}
                                                            hideNavigation
                                                            components={{
                                                                MonthCaption:
                                                                    DatePickerCaption,
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="mt-3 flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setAccForm(
                                                                    (f) => ({
                                                                        ...f,
                                                                        end_date:
                                                                            "",
                                                                    }),
                                                                )
                                                            }
                                                            className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                                        >
                                                            초기화
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setShowAccEndPicker(
                                                                    false,
                                                                )
                                                            }
                                                            className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-bold text-white hover:bg-amber-600"
                                                        >
                                                            적용
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>,
                                            document.body,
                                        )}
                                </div>
                                <div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-medium text-stone-500">
                                            접근성 신규
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setAccForm((f) => ({
                                                    ...f,
                                                    is_new: !f.is_new,
                                                }))
                                            }
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${accForm.is_new ? "bg-amber-500" : "bg-stone-200"}`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                        ${accForm.is_new ? "translate-x-6" : "translate-x-1"}`}
                                            />
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        점검 상태
                                    </label>
                                    <Select
                                        options={ACC_OPTIONS}
                                        value={{
                                            value: accForm.inspection_status,
                                            label: accForm.inspection_status,
                                        }}
                                        onChange={(opt) => {
                                            if (!opt) return;
                                            setAccForm({
                                                ...accForm,
                                                inspection_status: opt.value,
                                            });
                                        }}
                                        isSearchable={false}
                                        isClearable={false}
                                        styles={modalFormSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        비고
                                    </label>
                                    <textarea
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm min-h-[4rem] resize-y"
                                        placeholder="예) 기관 일정 조율 중"
                                        value={accForm.note}
                                        onChange={(e) =>
                                            setAccForm({
                                                ...accForm,
                                                note: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                {editAcc ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void deleteAcc(editAcc.id);
                                                closeAccModal();
                                            }}
                                            className="rounded-xl border border-red-300 bg-white py-3.5 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                                        >
                                            삭제하기
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void saveAccessibility()}
                                            className="bg-stone-800 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-stone-900 transition-colors"
                                        >
                                            저장하기
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void saveAccessibility()}
                                        className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm"
                                    >
                                        등록하기
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {deleteTarget &&
                    createPortal(
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                            onClick={() => !deleting && setDeleteTarget(null)}
                        >
                            <div
                                className="mx-4 w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="text-base font-bold text-stone-900">
                                    삭제 확인
                                </h3>
                                <p className="mt-2 text-sm text-stone-600">
                                    <strong>{deleteTarget.name}</strong>
                                    {deleteTarget.type === "project"
                                        ? " 프로젝트를"
                                        : " 접근성 항목을"}{" "}
                                    삭제할까요?
                                </p>
                                <p className="mt-1 text-xs text-red-600">
                                    이 작업은 되돌릴 수 없습니다.
                                </p>
                                <div className="mt-4 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        className="rounded-lg border border-stone-300 px-4 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
                                        onClick={() => setDeleteTarget(null)}
                                        disabled={deleting}
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                                        onClick={() => void confirmDelete()}
                                        disabled={deleting}
                                    >
                                        {deleting ? "삭제 중…" : "삭제"}
                                    </button>
                                </div>
                            </div>
                        </div>,
                        document.body,
                    )}
                {/* 변경 이력 패널 */}
                {historyProject && (
                    <FieldHistoryPanel
                        projectId={historyProject.id}
                        projectName={historyProject.name}
                        loadHistory={pf.loadHistory}
                        onClose={() => setHistoryProjectId(null)}
                    />
                )}

                {/* PIN 입력 모달 */}
                {pinModal && (
                    <div
                        className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
                        onClick={() => setPinModal(null)}
                    >
                        <div
                            className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl mx-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="text-center mb-5">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 mb-3">
                                    <i className="ri-lock-line text-xl text-amber-500" aria-hidden />
                                </div>
                                <h3 className="text-base font-bold text-stone-800">PIN 입력</h3>
                                <p className="text-xs text-stone-400 mt-1">세팅 정보를 보려면 PIN을 입력하세요</p>
                            </div>
                            <input
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                autoFocus
                                placeholder="4~6자리 숫자"
                                value={pinInput}
                                onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "")); setPinError(false); }}
                                onKeyDown={async (e) => {
                                    if (e.key !== "Enter" || !pinInput || pinVerifying) return;
                                    setPinVerifying(true);
                                    try {
                                        const ok = await pf.verifyPin(pinInput);
                                        if (ok) {
                                            setPinVerifiedAt(Date.now());
                                            const cb = pinModal.callback;
                                            setPinModal(null);
                                            cb();
                                        } else {
                                            setPinError(true);
                                            setPinInput("");
                                        }
                                    } finally { setPinVerifying(false); }
                                }}
                                className={`w-full text-center text-2xl tracking-[0.5em] font-mono rounded-xl border-2 py-3 outline-none transition-colors ${
                                    pinError ? "border-red-400 bg-red-50 animate-shake" : "border-stone-200 focus:border-amber-400"
                                }`}
                            />
                            {pinError && (
                                <p className="text-xs text-red-500 text-center mt-2">PIN이 틀렸습니다</p>
                            )}
                            <div className="flex gap-2 mt-4">
                                <button
                                    type="button"
                                    disabled={pinVerifying || pinInput.length < 4}
                                    onClick={async () => {
                                        if (!pinInput || pinVerifying) return;
                                        setPinVerifying(true);
                                        try {
                                            const ok = await pf.verifyPin(pinInput);
                                            if (ok) {
                                                setPinVerifiedAt(Date.now());
                                                const cb = pinModal.callback;
                                                setPinModal(null);
                                                cb();
                                            } else {
                                                setPinError(true);
                                                setPinInput("");
                                            }
                                        } finally { setPinVerifying(false); }
                                    }}
                                    className="flex-1 bg-amber-500 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
                                >
                                    {pinVerifying ? "확인 중..." : "확인"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPinModal(null)}
                                    className="flex-1 border border-stone-200 text-stone-500 font-medium py-2.5 rounded-xl text-sm"
                                >
                                    취소
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {toast && (
                    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
                        {toast}
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
