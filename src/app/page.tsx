"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabase } from "@/infrastructure/supabase/client";
import {
    calcLevel,
    getNextLevel,
    expBar,
    rpcAttendanceCheck,
    LEVELS,
    rpcSetTaskStatus,
    rpcSetQuestDone,
    EXP_REWARDS,
} from "@/features/gamification/maple";
import { useAuth } from "@/components/AuthProvider";
import AuthGuard from "@/components/AuthGuard";
import Header from "@/components/Header";
import Tooltip from "@/components/Tooltip";
import type { Quest, Player, Task, Project } from "@/shared/types";
import {
    findProjectId,
    getDiff,
    formatWorkload,
    normalizeProject,
} from "@/shared/utils/utils";
import {
    questContentLooksLikeStoredHtml,
    questRichTextIsEffectivelyEmpty,
    toQuestEditorInitialHtml,
} from "@/features/gamification/questContentDisplay";
import {
    BAR_COLORS,
    TYPE_COLORS,
    STATUS_COLORS,
    WORKLOAD_PRESETS,
} from "@/shared/constants";
import Avatar from "@/components/Avatar";
import LevelUpOverlay from "@/components/LevelUpOverlay";
import MvpOverlay from "@/components/MvpOverlay";
import ExpPopup, { type ExpPopupType } from "@/components/ExpPopup";
import AttendanceHeatmap from "@/components/AttendanceHeatmap";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import { PageSpinner } from "@/components/Spinner";
import { DayPicker, DateRange } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import {
    DndContext,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Select from "react-select";
import {
    projectSearchSelectStyles,
    modalFormSelectStyles,
    badgeSelectStyles,
} from "@/shared/styles/reactSelectStyles";
import { toLocalYmd } from "@/shared/utils/toLocalYmd";
import TiptapQuestContentEditor from "@/components/TiptapQuestContentEditor";
import TaskContentInputs from "@/components/TaskContentInputs";
import TaskContentList from "@/components/TaskContentList";
import { sanitizeHtml } from "@/shared/utils/sanitizeHtml";
import { stripHtmlTags } from "@/features/gamification/questContentDisplay";
import SeasonBanner from "@/components/SeasonBanner";

function QuestCardContent({
    content,
    plainClassName,
    completing,
}: {
    content: string;
    plainClassName?: string;
    completing?: boolean;
}) {
    const isHtml = questContentLooksLikeStoredHtml(content);
    if (isHtml) {
        const inner = sanitizeHtml(content.trim() ? content.trim() : "<p></p>");
        return (
            <div className={`notice-editor min-w-0 ${completing ? "line-through text-stone-400" : ""}`}>
                <div
                    className={`ProseMirror tiptap break-words text-sm font-medium leading-snug [&_li]:mb-0 [&_ol]:mb-0 [&_p]:!text-sm [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:mb-0 ${completing ? "text-stone-400" : "text-stone-800"}`}
                    dangerouslySetInnerHTML={{ __html: inner }}
                />
            </div>
        );
    }
    return (
        <p
            className={
                completing
                    ? "whitespace-pre-wrap break-words text-sm font-medium text-stone-400 line-through"
                    : (plainClassName ??
                      "whitespace-pre-wrap break-words text-sm font-medium text-stone-800")
            }
        >
            {content}
        </p>
    );
}

type QuestFormType = {
    content: string;
    proj: string;
    end_date: string;
};

type QuestListItem =
    | { type: "task"; data: Task; id: string }
    | { type: "quest"; data: Quest; id: string };

type QuestFormModalProps = {
    title: string;
    questForm: QuestFormType;
    setQuestForm: React.Dispatch<React.SetStateAction<QuestFormType>>;
    onSubmit: () => void;
    onClose: () => void;
    onDelete?: () => void;
    projects: Project[];
    editorMountKey: string;
};

function toSeoulYmd(date: Date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
}

function addDaysToYmd(ymd: string, days: number) {
    const date = new Date(`${ymd}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function QuestFormModal({
    title,
    questForm,
    setQuestForm,
    onSubmit,
    onClose,
    onDelete,
    projects,
    editorMountKey,
}: QuestFormModalProps) {
    const [showDatePicker, setShowDatePicker] = useState(false);
    const selectedDate = questForm.end_date
        ? new Date(`${questForm.end_date}T00:00:00`)
        : undefined;
    const dateLabel = selectedDate
        ? `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}`
        : "마감일 선택";
    const projOptions = [...projects]
        .filter((p) => !p.is_archived)
        .sort((a, b) => a.name.localeCompare(b.name, "ko"))
        .map((p) => ({ value: p.name, label: p.name }));
    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            onClick={onClose}
        >
            <div
                className="max-h-[calc(100dvh-83px)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
                style={{ marginBottom: "67px" }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-base font-bold">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-2xl text-stone-400 leading-none"
                    >
                        ×
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                            퀘스트 내용 <span className="text-red-500">*</span>
                        </label>
                        <TiptapQuestContentEditor
                            key={editorMountKey}
                            initialHtml={toQuestEditorInitialHtml(
                                questForm.content,
                            )}
                            onChange={(html) =>
                                setQuestForm((f) => ({ ...f, content: html }))
                            }
                            placeholder="예: 메인 슬라이드 리브리핑"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                            프로젝트
                        </label>
                        <Select
                            options={projOptions}
                            value={
                                questForm.proj
                                    ? {
                                          value: questForm.proj,
                                          label: questForm.proj,
                                      }
                                    : null
                            }
                            onChange={(opt) =>
                                setQuestForm((f) => ({
                                    ...f,
                                    proj: opt?.value ?? "",
                                }))
                            }
                            placeholder="프로젝트 검색"
                            isClearable
                            isSearchable
                            styles={projectSearchSelectStyles}
                            menuPortalTarget={
                                typeof document !== "undefined"
                                    ? document.body
                                    : null
                            }
                            noOptionsMessage={() => "검색 결과가 없어요"}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                            마감일
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowDatePicker((p) => !p)}
                            className={`w-full border rounded-lg px-3 py-2.5 text-sm text-left transition-all
                            ${showDatePicker ? "ring-2 ring-amber-200 border-amber-300" : "border-stone-200 hover:border-stone-300"}`}
                        >
                            <span
                                className={
                                    selectedDate
                                        ? "text-stone-800"
                                        : "text-stone-400"
                                }
                            >
                                {dateLabel}
                            </span>
                        </button>
                        {showDatePicker &&
                            typeof document !== "undefined" &&
                            createPortal(
                                <div
                                    className="fixed inset-0 z-[200] bg-black/30"
                                    onClick={() => setShowDatePicker(false)}
                                    role="presentation"
                                >
                                    <div
                                        className="absolute left-1/2 w-[min(calc(100vw-2rem),36rem)] -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-2xl"
                                        style={{
                                            bottom: "max(5.5rem, calc(var(--nav-height, 0px) + 3.5rem))",
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex justify-center overflow-x-auto">
                                            <DayPicker
                                                mode="single"
                                                selected={selectedDate}
                                                onSelect={(d) => {
                                                    setQuestForm({
                                                        ...questForm,
                                                        end_date: d
                                                            ? toLocalYmd(d)
                                                            : "",
                                                    });
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
                                                    setQuestForm({
                                                        ...questForm,
                                                        end_date: "",
                                                    })
                                                }
                                                className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                            >
                                                초기화
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowDatePicker(false)
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
                    {onDelete ? (
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => { if (confirm("정말 삭제할까요?")) onDelete(); }}
                                className="rounded-xl border border-red-300 bg-white py-3.5 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                            >
                                삭제하기
                            </button>
                            <button
                                onClick={onSubmit}
                                className="bg-stone-800 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-stone-900 transition-colors"
                            >
                                저장하기
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={onSubmit}
                            className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm"
                        >
                            추가하기
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/** 업무 수정 모달 기간 버튼 라벨 */
function periodButtonLabel(range: DateRange | undefined): {
    text: string;
    placeholder: boolean;
} {
    if (!range?.from) return { text: "기간 선택", placeholder: true };
    const f = `${range.from.getMonth() + 1}/${range.from.getDate()}`;
    if (!range.to) return { text: `${f} ~`, placeholder: false };
    const t = `${range.to.getMonth() + 1}/${range.to.getDate()}`;
    return { text: `${f} ~ ${t}`, placeholder: false };
}

const EMPTY_EDIT_TASK = {
    type: "",
    proj: "",
    content: "",
    priority: "",
    workload: 0,
    issue: "",
    status: "",
    is_plan: false,
    is_starred: false,
};

function HomeWorkloadInput({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-stone-500">
                    공수
                </label>
                {value > 0 && (
                    <span className="text-xs font-medium text-amber-600">
                        {formatWorkload(value)}
                    </span>
                )}
            </div>
            <input
                type="number"
                className="mb-2 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                placeholder="분 직접 입력"
                value={value || ""}
                onChange={(e) => onChange(parseInt(e.target.value) || 0)}
            />
            <div className="flex flex-wrap gap-1.5">
                {WORKLOAD_PRESETS.map((p) => (
                    <button
                        type="button"
                        key={p.label}
                        onClick={() => onChange(p.value)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all
                ${value === p.value ? "border-amber-500 bg-amber-500 text-white" : "border-stone-200 bg-stone-50 text-stone-600"}`}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function HomeMyTaskRow({
    task: t,
    showBorderBottom,
    onStatusChange,
    onEdit,
    onDelete,
    onCompleting,
}: {
    task: Task;
    showBorderBottom: boolean;
    onStatusChange: (
        id: number,
        status: string,
        task: Task,
        anchor?: { x: number; y: number },
    ) => void;
    onEdit?: (task: Task) => void;
    onDelete?: (id: number) => void;
    onCompleting?: (taskId: number) => void;
}) {
    const statusWrapRef = useRef<HTMLDivElement>(null);
    const diff = getDiff(t.end_date);
    const ddayRed = diff !== null && diff <= 7;
    const ddayLabel =
        diff === null ? "" : diff < 0 ? `D+${Math.abs(diff)}` : `D-${diff}`;
    return (
        <div
            className={`px-4 py-3 transition-colors ${showBorderBottom ? "border-b border-stone-100" : ""} ${t.priority === "긴급" ? "bg-amber-50" : ""} ${onEdit ? "cursor-pointer hover:bg-stone-50/60" : ""}`}
            onClick={() => onEdit?.(t)}
        >
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    {t.is_starred && <span className="shrink-0 text-xs" title="핵심 프로젝트">⭐</span>}
                    {t.type && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[t.type] || "bg-gray-100 text-gray-600"}`}>{t.type}</span>
                    )}
                    <span className="truncate text-sm font-medium text-stone-800">{t.proj}</span>
                </div>
                {t.content && <TaskContentList content={t.content} className="mt-1 text-xs leading-relaxed text-stone-600" />}
                {t.issue && (
                    <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-100/80 px-2 py-1 text-xs text-amber-800">이슈: {t.issue}</p>
                )}
                <div className="mt-1 flex w-full items-center justify-between text-xs text-stone-400">
                    <div className="flex items-center gap-2">
                        {t.workload > 0 && <span>{formatWorkload(t.workload)}</span>}
                        {t.start_date && t.end_date && (
                            <span className={ddayRed ? "font-medium text-red-500" : ""}>
                                {t.start_date.slice(5).replace("-", "/")} ~ {t.end_date.slice(5).replace("-", "/")}{ddayLabel && ` · ${ddayLabel}`}
                            </span>
                        )}
                        {!t.start_date && t.end_date && (
                            <span className={ddayRed ? "font-medium text-red-500" : ""}>
                                ~{t.end_date.slice(5).replace("-", "/")}{ddayLabel && ` · ${ddayLabel}`}
                            </span>
                        )}
                        {t.workload === 0 && !t.start_date && !t.end_date && <span>기간 미정</span>}
                    </div>
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <div ref={statusWrapRef} className={`rounded-lg ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}>
                            <Select
                                options={["대기", "시작 전", "진행중", "지연/보류", "완료"].map((s) => ({ value: s, label: s }))}
                                value={{ value: t.status, label: t.status }}
                                onChange={(opt) => {
                                    if (!opt) return;
                                    const r = statusWrapRef.current?.getBoundingClientRect();
                                    if (opt.value === "완료" && t.status !== "완료") onCompleting?.(t.id);
                                    void onStatusChange(t.id, opt.value, t, { x: (r?.left ?? 0) + (r?.width ?? 0) / 2, y: (r?.top ?? 0) + (r?.height ?? 0) / 2 });
                                }}
                                isSearchable={false}
                                isClearable={false}
                                styles={badgeSelectStyles}
                                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                                menuPlacement="auto"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** 이번 세션 완료 퀘스트(되돌리기 가능) */
function CompletedQuestItem({
    quest: q,
    showBorderBottom,
    onUndo,
}: {
    quest: Quest;
    showBorderBottom: boolean;
    onUndo: (q: Quest) => void;
}) {
    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 opacity-60 ${showBorderBottom ? "border-b border-stone-100" : ""}`}
        >
            <span className="shrink-0 text-base leading-none">✨</span>
            <div className="min-w-0 flex-1">
                <QuestCardContent content={q.content} completing />
                {q.proj && (
                    <p className="mt-0.5 truncate text-xs text-stone-400">
                        {q.proj}
                    </p>
                )}
            </div>
            <button
                type="button"
                onClick={() => onUndo(q)}
                className="shrink-0 whitespace-nowrap text-xs text-stone-300 transition-colors hover:text-amber-500"
            >
                ↩ 되돌리기
            </button>
        </div>
    );
}

/** 오늘 기간인 업무 자동 포함 카드 */
function TodayTaskItem({
    id,
    task: t,
    showBorderBottom,
    showDragHandle,
    isCompleting,
    onExclude,
}: {
    id: string;
    task: Task;
    showBorderBottom: boolean;
    showDragHandle: boolean;
    isCompleting: boolean;
    onExclude: (id: number) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({ id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-start gap-3 px-4 py-3 ${
                isCompleting
                    ? "quest-completing"
                    : isDragging
                    ? "border-2 border-dashed border-amber-400 opacity-50 rounded-lg"
                    : isOver
                    ? "border-2 border-dashed border-amber-300 bg-amber-50 rounded-lg"
                    : showBorderBottom
                    ? "border-b border-stone-100"
                    : ""
            }`}
        >
            {showDragHandle && (
                <button
                    type="button"
                    {...listeners}
                    {...attributes}
                    className="touch-none cursor-grab self-center px-0.5 text-stone-300 hover:text-stone-500 active:cursor-grabbing"
                    tabIndex={-1}
                    aria-label="순서 변경"
                >
                    ⠿
                </button>
            )}
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-stone-800">{t.proj}</p>
                {t.content && (
                    <p className="mt-0.5 text-sm text-stone-500 line-clamp-1">{t.content.split("\n")[0]}</p>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    {t.type && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[t.type] || "bg-gray-100 text-gray-600"}`}>
                            {t.type}
                        </span>
                    )}
                    {t.is_starred && <span className="text-xs" title="핵심 프로젝트">⭐</span>}
                </div>
            </div>
            <button
                type="button"
                onClick={() => onExclude(t.id)}
                className="shrink-0 self-center rounded px-2 py-1 text-xs font-medium text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500"
            >
                거절하기
            </button>
        </div>
    );
}

function SortableQuestItem({
    sortableId,
    quest: q,
    showBorderBottom,
    showDragHandle,
    isCompleting,
    myTasks,
    onComplete,
    onEdit,
    onDelete,
}: {
    sortableId: string;
    quest: Quest;
    showBorderBottom: boolean;
    showDragHandle: boolean;
    isCompleting: boolean;
    myTasks: Task[];
    onComplete: (q: Quest, e: React.MouseEvent) => void;
    onEdit: (q: Quest) => void;
    onDelete: (id: number) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({ id: sortableId });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const diff = getDiff(q.end_date);
    const linkedProj =
        q.task_id != null
            ? myTasks.find((t) => Number(t.id) === Number(q.task_id))?.proj
            : undefined;

    const projName = q.proj || linkedProj;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-start gap-3 px-4 py-3 ${
                isCompleting
                    ? "quest-completing"
                    : isDragging
                    ? "border-2 border-dashed border-amber-400 opacity-50 rounded-lg"
                    : isOver
                    ? "border-2 border-dashed border-amber-300 bg-amber-50 rounded-lg"
                    : showBorderBottom
                    ? "border-b border-stone-100"
                    : ""
            }`}
        >
            {showDragHandle && (
                <button
                    type="button"
                    {...listeners}
                    {...attributes}
                    className="touch-none cursor-grab self-center px-0.5 text-stone-300 hover:text-stone-500 active:cursor-grabbing"
                    tabIndex={-1}
                    aria-label="순서 변경"
                >
                    ⠿
                </button>
            )}
            <button
                onClick={(ev) => { if (!isCompleting) onComplete(q, ev); }}
                disabled={isCompleting}
                className={`mt-0.5 shrink-0 text-base leading-none transition-transform ${isCompleting ? "cursor-default" : "hover:scale-125 active:scale-110"}`}
                aria-label={isCompleting ? "완료 처리 중" : "퀘스트 완료"}
            >
                {isCompleting ? "✨" : "⚔️"}
            </button>
            <div className={`min-w-0 flex-1 ${isCompleting ? "opacity-60" : ""}`}>
                <QuestCardContent content={q.content} completing={isCompleting} />
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    {projName && (
                        <span className="truncate text-xs text-stone-500">{projName}</span>
                    )}
                    {q.end_date && (
                        <span className={`text-xs font-medium ${diff !== null && diff <= 3 ? "text-red-500" : "text-stone-500"}`}>
                            {q.end_date.slice(5).replace("-", "/")}
                            {diff !== null && ` D${diff < 0 ? "+" + Math.abs(diff) : "-" + diff}`}
                        </span>
                    )}
                    {!isCompleting && (
                        <span className="text-xs font-bold text-green-600">+10 EXP</span>
                    )}
                </div>
            </div>
            {!isCompleting && (
                <button
                    onClick={() => onEdit(q)}
                    aria-label="수정"
                    className="shrink-0 self-center text-base text-stone-400 transition-colors hover:text-amber-500"
                >
                    <i className="ri-edit-line" aria-hidden />
                </button>
            )}
        </div>
    );
}

export default function HomePage() {
    const {
        member,
        members,
        playerId,
        teamId,
        teams,
        loading: authLoading,
    } = useAuth();
    const router = useRouter();
    const isGuest = member === "GUEST";

    const channelIdRef = useRef(Math.random().toString(36).slice(2));
    const loadGenerationRef = useRef(0);
    const [showQuestModal, setShowQuestModal] = useState(false);
    const [player, setPlayer] = useState<Player | null>(null);
    const [quests, setQuests] = useState<Quest[]>([]);
    const [myTasks, setMyTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [guestTeamTasks, setGuestTeamTasks] = useState<Task[]>([]);
    const [toast, setToast] = useState("");
    const [isAttending, setIsAttending] = useState(false);
    const [showAddQuest, setShowAddQuest] = useState(false);
    const [completingQuestIds, setCompletingQuestIds] = useState<Set<number>>(new Set());
    const [completedQuestsThisSession, setCompletedQuestsThisSession] = useState<Quest[]>([]);
    const [completingTaskIds, setCompletingTaskIds] = useState<Set<number>>(new Set());
    const [allQuestItems, setAllQuestItems] = useState<QuestListItem[]>([]);
    const [showEditQuest, setShowEditQuest] = useState(false);
    const [editTarget, setEditTarget] = useState<Quest | null>(null);
    const [questForm, setQuestForm] = useState<QuestFormType>({
        content: "",
        proj: "",
        end_date: "",
    });
    const [questAddEditorNonce, setQuestAddEditorNonce] = useState(0);

    const [showEditTask, setShowEditTask] = useState(false);
    const [editTask, setEditTask] = useState<Task | null>(null);
    const [editForm, setEditForm] = useState({ ...EMPTY_EDIT_TASK });
    const [editDateRange, setEditDateRange] = useState<DateRange | undefined>();
    const [showEditDatePicker, setShowEditDatePicker] = useState(false);
    const [editProjTab, setEditProjTab] = useState<"mine" | "all">("mine");
    const [declineConfirm, setDeclineConfirm] = useState<{ type: "task" | "quest"; id: number } | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 50, tolerance: 5 },
        }),
    );

    const onQuestDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;

            setAllQuestItems((prev) => {
                const oldIndex = prev.findIndex((item) => item.id === active.id);
                const newIndex = prev.findIndex((item) => item.id === over.id);
                if (oldIndex === -1 || newIndex === -1) return prev;
                const reordered = arrayMove(prev, oldIndex, newIndex);
                // quest ??낅쭔 order_index ???
                reordered.forEach((item, i) => {
                    if (item.type === "quest") {
                        void supabase
                            .from("quests")
                            .update({ order_index: i })
                            .eq("id", item.data.id)
                            .then(({ error }) => {
                                if (error) console.error("[quest reorder]", error.message);
                            });
                    }
                });
                return reordered;
            });
        },
        [],
    );

    const [levelUpInfo, setLevelUpInfo] = useState({
        show: false,
        level: 0,
        levelName: "",
    });
    const [mvpInfo, setMvpInfo] = useState<{
        show: boolean;
        name: string;
        weekExp: number;
        taskCount: number;
    } | null>(null);
    const [expPopups, setExpPopups] = useState<
        {
            id: string;
            amount: number;
            x: number;
            y: number;
            type: ExpPopupType;
        }[]
    >([]);
    const expPopupSeq = useRef(0);

    const closeLevelUp = useCallback(() => {
        setLevelUpInfo((prev) => ({ ...prev, show: false }));
    }, []);

    const pushExpPopup = useCallback(
        (amount: number, x: number, y: number, type: ExpPopupType) => {
            expPopupSeq.current += 1;
            const id = `exp-${Date.now()}-${expPopupSeq.current}`;
            setExpPopups((prev) => [...prev, { id, amount, x, y, type }]);
        },
        [],
    );

    const removeExpPopup = useCallback((id: string) => {
        setExpPopups((prev) => prev.filter((p) => p.id !== id));
    }, []);

    const editMember = editTask?.member ?? member ?? "";

    const editMyProjOptions = useMemo(
        () =>
            projects
                .filter((p) => !p.is_archived)
                .filter(
                    (p) =>
                        editMember &&
                        ((p.members || []).includes(editMember) ||
                            p.member === editMember),
                )
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((p) => ({ value: p.name, label: p.name })),
        [projects, editMember],
    );

    const editAllProjOptions = useMemo(
        () =>
            projects
                .filter((p) => !p.is_archived)
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((p) => ({ value: p.name, label: p.name })),
        [projects],
    );

    const editProjOptions =
        editProjTab === "mine" ? editMyProjOptions : editAllProjOptions;

    const editPeriodLabel = useMemo(
        () => periodButtonLabel(editDateRange),
        [editDateRange],
    );

    useEffect(() => {
        if (!authLoading && !member) router.push("/login");
    }, [authLoading, member]);

    useEffect(() => {
        if (member && teamId) {
            loadData();

            // Realtime 援щ룆
            const channel = supabase
                .channel(`home-realtime-${channelIdRef.current}`)
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "quests" },
                    () => {
                        loadData();
                    },
                )
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "players" },
                    () => {
                        loadData();
                    },
                )
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "tasks" },
                    () => {
                        loadData();
                    },
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel).catch(console.error);
            };
        }
    }, [member, teamId]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!member || !teamId || member === "GUEST" || authLoading) return;
        let cancelled = false;

        const todayYmd = toSeoulYmd();
        const today = new Date(`${todayYmd}T00:00:00Z`);
        if (today.getUTCDay() !== 1) return;

        // ?대쾲 二??붿슂?쇱뿉 ?대? ?レ븯?쇰㈃ ?ㅼ떆 ?꾩슦吏 ?딆쓬
        const thisMonday = todayYmd;
        const dismissedKey = `mvp_popup_dismissed_week_${teamId}`;
        if (localStorage.getItem(dismissedKey) === thisMonday)
            return;

        const lockKey = `mvp_lock_${teamId}_${thisMonday}`;
        if (sessionStorage.getItem(lockKey)) return;
        sessionStorage.setItem(lockKey, "1");

        const startYmd = addDaysToYmd(todayYmd, -7);
        const endYmd = addDaysToYmd(todayYmd, -1);

        void (async () => {
            try {
                const { data: players, error: pErr } = await supabase
                    .from("players")
                    .select("*")
                    .eq("team_id", teamId);
                if (pErr || !players?.length) {
                    sessionStorage.removeItem(lockKey);
                    return;
                }

                const { data: tasks, error: tErr } = await supabase
                    .from("tasks")
                    .select("member, end_date")
                    .eq("team_id", teamId)
                    .eq("status", "완료")
                    .not("end_date", "is", null)
                    .gte("end_date", startYmd)
                    .lte("end_date", endYmd);

                if (tErr) {
                    sessionStorage.removeItem(lockKey);
                    return;
                }

                const countByMember: Record<string, number> = {};
                for (const t of tasks ?? []) {
                    const m = (t as Task).member;
                    if (!m) continue;
                    countByMember[m] = (countByMember[m] || 0) + 1;
                }

                let best: {
                    name: string;
                    score: number;
                    weekExp: number;
                    taskCount: number;
                } | null = null;

                for (const pl of players) {
                    const name = pl.name as string;
                    const weekExp = Number(pl.week_exp ?? 0);
                    const taskCount = countByMember[name] ?? 0;
                    const score = weekExp + taskCount * 50;
                    if (
                        !best ||
                        score > best.score ||
                        (score === best.score && weekExp > best.weekExp)
                    ) {
                        best = { name, score, weekExp, taskCount };
                    }
                }

                if (!best) {
                    sessionStorage.removeItem(lockKey);
                    return;
                }

                if (cancelled) return;
                setMvpInfo({
                    show: true,
                    name: best.name,
                    weekExp: best.weekExp,
                    taskCount: best.taskCount,
                });
            } catch {
                sessionStorage.removeItem(lockKey);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [member, teamId, authLoading]);

    // myTasks/quests 蹂寃????듯빀 紐⑸줉 ?ш뎄??(?쒕옒洹?以묒뿉??allQuestItems留?蹂寃쎈릺誘濡?deps 遺덈?)
    useEffect(() => {
        const todayStr = toLocalYmd(new Date());
        const todayTasks = myTasks.filter((t) => {
            if (t.status === "완료") return false;
            if (t.is_excluded_today === true) return false;
            if (!t.end_date) return false;
            const afterStart = !t.start_date || t.start_date <= todayStr;
            const beforeEnd = t.end_date >= todayStr;
            return afterStart && beforeEnd;
        });
        setAllQuestItems([
            ...todayTasks.map((t) => ({ type: "task" as const, data: t, id: `task-${t.id}` })),
            ...quests.map((q) => ({ type: "quest" as const, data: q, id: `quest-${q.id}` })),
        ]);
    }, [myTasks, quests]);

    if (authLoading) return <PageSpinner />;
    if (!member) return null;

    async function loadData() {
        if (!teamId) return;
        const generation = ++loadGenerationRef.current;
        const [
            { data: playerData },
            { data: questData },
            { data: myTaskData },
            { data: guestTaskData },
            { data: projData },
        ] = await Promise.all([
            supabase
                .from("players")
                .select("*")
                .eq("team_id", teamId)
                .eq("name", member)
                .maybeSingle(),
            supabase
                .from("quests")
                .select("*")
                .eq("team_id", teamId)
                .eq("member", member)
                .neq("status", "완료")
                .order("order_index", { ascending: true, nullsFirst: false })
                .order("created_at", { ascending: true }),
            supabase
                .from("tasks")
                .select("*")
                .eq("team_id", teamId)
                .eq("member", member)
                .order("end_date", { ascending: true }),
            isGuest
                ? supabase
                      .from("tasks")
                      .select("*")
                      .eq("team_id", teamId)
                      .order("end_date", { ascending: true })
                : Promise.resolve({ data: [] as Task[] }),
            supabase
                .from("projects")
                .select("*")
                .eq("team_id", teamId)
                .order("name", { ascending: true }),
        ]);
        if (generation !== loadGenerationRef.current) return;
        setPlayer(playerData);
        setQuests(questData || []);
        setMyTasks(myTaskData || []);
        setGuestTeamTasks(guestTaskData || []);
        setProjects(
            (projData || []).map((row) =>
                normalizeProject(row as Record<string, unknown>),
            ),
        );
    }

    function showToastMsg(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    }

    async function handleAttend(e: React.MouseEvent) {
        if (!player || !member || isAttending) return;
        const today = toLocalYmd(new Date());
        if (player.attend_last === today) {
            showToastMsg("오늘은 이미 출석했어요");
            return;
        }
        setIsAttending(true);
        try {
            const result = await rpcAttendanceCheck(member);
            if (!result.success) {
                showToastMsg(result.message || "?ㅻ쪟");
                return;
            }
            pushExpPopup(
                result.exp ?? EXP_REWARDS.ATTEND,
                e.clientX,
                e.clientY,
                "attend",
            );
            if (result.levelUp && result.newLv) {
                setLevelUpInfo({
                    show: true,
                    level: result.newLv.level,
                    levelName: result.newLv.name,
                });
            } else {
                showToastMsg(
                    `출석 완료! +${result.exp} EXP · ${result.streak}일 연속`,
                );
            }
            await loadData();
        } finally {
            setIsAttending(false);
        }
    }

    async function completeQuest(quest: Quest, e: React.MouseEvent) {
        if (!member) return;
        if (completingQuestIds.has(quest.id)) return;
        const { clientX, clientY } = e;

        // ?좊땲硫붿씠???쒖옉
        setCompletingQuestIds((prev) => new Set([...prev, quest.id]));
        await new Promise<void>((resolve) => setTimeout(resolve, 650));

        // DB ?낅뜲?댄듃 + EXP 吏湲?(?쒕쾭 RPC 媛 ?먯옄?곸쑝濡?
        const result = await rpcSetQuestDone(quest.id, true, member).catch(
            () => null,
        );
        if (result?.scored) {
            pushExpPopup(result.amount, clientX, clientY, "quest");
        }
        if (result?.levelUp && result.newLv) {
            setLevelUpInfo({
                show: true,
                level: result.newLv.level,
                levelName: result.newLv.name,
            });
        } else {
            showToastMsg(`완료! +${result?.amount ?? 0} EXP`);
        }

        // ?좊땲硫붿씠??醫낅즺 + ?꾨즺 紐⑸줉 ?대룞
        setCompletingQuestIds((prev) => {
            const next = new Set(prev);
            next.delete(quest.id);
            return next;
        });
        setQuests((prev) => prev.filter((q) => q.id !== quest.id));
        setCompletedQuestsThisSession((prev) => [...prev, quest]);
        loadData();
    }

    async function addQuest() {
        if (!teamId) return;
        if (questRichTextIsEffectivelyEmpty(questForm.content))
            return alert("퀘스트 내용은 필수예요");
        if (!member || playerId === null) {
            showToastMsg("현재 팀의 담당자 정보를 찾을 수 없어요");
            return;
        }
        const selectedProjectId = findProjectId(projects, questForm.proj);
        if (questForm.proj && selectedProjectId === null) {
            showToastMsg("현재 팀의 프로젝트를 다시 선택해주세요");
            return;
        }
        const maxOrder = quests.reduce(
            (m, q) => Math.max(m, q.order_index ?? 0),
            0,
        );
        await supabase.from("quests").insert([
            {
                member: member,
                player_id: playerId,
                content: questForm.content,
                proj: questForm.proj || null,
                project_id: selectedProjectId,
                end_date: questForm.end_date || null,
                task_id: null,
                status: "대기",
                order_index: maxOrder + 1,
                team_id: teamId,
            },
        ]);
        setShowAddQuest(false);
        setQuestForm({
            content: "",
            proj: "",
            end_date: "",
        });
        loadData();
    }

    function deleteQuest(id: number) {
        setDeclineConfirm({ type: "quest", id });
    }

    async function undoQuest(quest: Quest) {
        // ?꾨즺 痍⑥냼 ???쒕쾭 RPC 媛 ?곹깭 ?섎룎由?+ ?먯닔 李④컧(-10).
        await rpcSetQuestDone(quest.id, false, member!).catch(() => null);
        setCompletedQuestsThisSession((prev) =>
            prev.filter((q) => q.id !== quest.id),
        );
        loadData();
    }

    function handleTaskCompleting(taskId: number) {
        setCompletingTaskIds((prev) => new Set([...prev, taskId]));
        setTimeout(() => {
            loadData();
            setCompletingTaskIds((prev) => {
                const next = new Set(prev);
                next.delete(taskId);
                return next;
            });
        }, 650);
    }

    function excludeToday(taskId: number) {
        setDeclineConfirm({ type: "task", id: taskId });
    }

    async function confirmDecline() {
        if (!declineConfirm) return;
        if (declineConfirm.type === "task") {
            await supabase
                .from("tasks")
                .update({ is_excluded_today: true })
                .eq("id", declineConfirm.id);
        } else {
            await supabase.from("quests").delete().eq("id", declineConfirm.id);
        }
        setDeclineConfirm(null);
        showToastMsg("흠... 다음엔 꼭 해오거라.");
        loadData();
    }

    function openEditQuest(quest: Quest) {
        setEditTarget(quest);
        setQuestForm({
            content: toQuestEditorInitialHtml(quest.content),
            proj: quest.proj || "",
            end_date: quest.end_date || "",
        });
        setShowEditQuest(true);
    }

    async function saveEditQuest() {
        if (!editTarget) return;
        const selectedProjectId = findProjectId(projects, questForm.proj);
        if (questForm.proj && selectedProjectId === null) {
            showToastMsg("현재 팀의 프로젝트를 다시 선택해주세요");
            return;
        }
        await supabase
            .from("quests")
            .update({
                content: questForm.content,
                proj: questForm.proj || null,
                project_id: selectedProjectId,
                end_date: questForm.end_date || null,
                task_id: editTarget.task_id ?? null,
            })
            .eq("id", editTarget.id);
        setShowEditQuest(false);
        setEditTarget(null);
        setQuestForm({
            content: "",
            proj: "",
            end_date: "",
        });
        loadData();
    }

    async function updateTaskStatus(
        id: number,
        status: string,
        task: Task,
        anchor?: { x: number; y: number },
    ) {
        // ?곹깭 蹂寃?+ ?먯닔???쒕쾭 RPC 媛 ?먯옄?곸쑝濡?泥섎━.
        const result = await rpcSetTaskStatus(id, status, task.member).catch(
            () => null,
        );
        if (!result) {
            showToastMsg("권한이 없어 상태를 변경할 수 없어요");
            return;
        }
        if (result.scored && result.sign > 0) {
            if (anchor) {
                pushExpPopup(
                    result.amount,
                    anchor.x,
                    anchor.y,
                    task.priority === "긴급" ? "urgent" : "complete",
                );
            }
            if (result.levelUp && result.newLv) {
                setLevelUpInfo({
                    show: true,
                    level: result.newLv.level,
                    levelName: result.newLv.name,
                });
            }
        }
        if (task.show_on_team_calendar) {
            void syncTaskToTeamCalendar(id).catch((err) => {
                console.warn("[team-calendar]", err instanceof Error ? err.message : "동기화 실패");
            });
        }
        loadData();
    }

    function toggleEditIsPlan() {
        setEditForm((f) => ({ ...f, is_plan: !f.is_plan }));
    }

    async function syncTaskToTeamCalendar(taskId: number) {
        const res = await fetch(`/api/agents/team-calendar/tasks/${taskId}`, {
            method: "POST",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(json.message || "팀 캘린더 동기화 실패");
        }
        return json;
    }

    async function deleteTaskFromTeamCalendar(taskId: number) {
        const res = await fetch(`/api/agents/team-calendar/tasks/${taskId}`, {
            method: "DELETE",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(json.message || "팀 캘린더 일정 삭제 실패");
        }
        return json;
    }

    async function deleteMyTask(id: number) {
        if (!confirm("삭제할까요?")) return;
        try {
            await deleteTaskFromTeamCalendar(id);
        } catch (err) {
            if (
                !confirm(
                    `${err instanceof Error ? err.message : "팀 캘린더 일정 삭제 실패"}\n그래도 업무를 삭제할까요?`,
                )
            ) {
                return;
            }
        }
        await supabase.from("tasks").delete().eq("id", id);
        loadData();
    }

    function openEditTask(task: Task) {
        setEditTask(task);
        setEditForm({
            type: task.type || "",
            proj: task.proj || "",
            content: task.content || "",
            priority: task.priority || "",
            workload: task.workload || 0,
            issue: task.issue || "",
            status: task.status || "대기",
            is_plan: task.is_plan ?? false,
            is_starred: task.is_starred ?? false,
        });
        if (task.start_date || task.end_date) {
            setEditDateRange({
                from: task.start_date
                    ? new Date(`${task.start_date}T00:00:00`)
                    : undefined,
                to: task.end_date
                    ? new Date(`${task.end_date}T00:00:00`)
                    : undefined,
            });
        } else {
            setEditDateRange(undefined);
        }
        setEditProjTab("mine");
        setShowEditDatePicker(false);
        setShowEditTask(true);
    }

    async function saveEditTask() {
        if (!editTask) return;
        const selectedProjectId = findProjectId(projects, editForm.proj);
        if (selectedProjectId === null) {
            showToastMsg("현재 팀의 프로젝트를 다시 선택해주세요");
            return;
        }
        if (!editDateRange?.from && !editDateRange?.to) {
            alert("업무 캘린더 등록을 위해 기간 또는 마감일을 선택해주세요");
            return;
        }
        await supabase
            .from("tasks")
            .update({
                type: editForm.type,
                proj: editForm.proj,
                project_id: selectedProjectId,
                content: editForm.content,
                priority: editForm.priority || null,
                start_date: editDateRange?.from
                    ? toLocalYmd(editDateRange.from)
                    : null,
                end_date: editDateRange?.to
                    ? toLocalYmd(editDateRange.to)
                    : editDateRange?.from
                      ? toLocalYmd(editDateRange.from)
                      : null,
                workload: editForm.workload || 0,
                issue: editForm.issue || null,
                status: editForm.status,
                is_plan: editForm.is_plan ?? false,
                is_starred: editForm.is_starred ?? false,
                show_on_team_calendar: true,
            })
            .eq("id", editTask.id);
        void syncTaskToTeamCalendar(editTask.id).catch((err) => {
            showToastMsg(
                err instanceof Error
                    ? err.message
                    : "팀 캘린더 동기화 실패",
            );
        });
        setShowEditTask(false);
        setEditTask(null);
        setEditForm({ ...EMPTY_EDIT_TASK });
        setEditDateRange(undefined);
        setShowEditDatePicker(false);
        loadData();
    }

    const lv = player ? calcLevel(player.exp) : LEVELS[0];
    const next = player ? getNextLevel(player.exp) : null;
    const pct = player ? expBar(player.exp) : 0;
    const today = toLocalYmd(new Date());
    const attended = player?.attend_last === today;
    const barColor =
        BAR_COLORS[Math.min((lv.level || 1) - 1, BAR_COLORS.length - 1)];

    const urgentQuests = quests.filter((q) => {
        const d = getDiff(q.end_date);
        return d !== null && d <= 3;
    });

    const stats = {
        exp: player?.month_exp || 0,
    };

    const guestTeamSummary = members.map((name) => {
        const memberTasks = guestTeamTasks.filter((t) => t.member === name);
        const doingCount = memberTasks.filter(
            (t) => t.status !== "완료",
        ).length;
        const doneCount = memberTasks.filter((t) => t.status === "완료").length;
        const hasStarred = memberTasks.some(
            (t) => t.status !== "완료" && t.is_starred,
        );
        return { name, doingCount, doneCount, hasStarred };
    });

    const guestUrgentTasks = guestTeamTasks
        .filter((t) => {
            if (t.status === "완료") return false;
            const d = getDiff(t.end_date);
            return d !== null && d <= 7;
        })
        .sort(
            (a, b) => (getDiff(a.end_date) ?? 99) - (getDiff(b.end_date) ?? 99),
        );

    const activeMyTasks = myTasks.filter((t) => t.status !== "완료");

    // ?ㅻ뒛???섏뒪??吏꾪뻾 諛?
    const completedCount = completedQuestsThisSession.length;
    const totalQuestCount = allQuestItems.length + completedCount;
    const progressPct =
        totalQuestCount > 0
            ? Math.round((completedCount / totalQuestCount) * 100)
            : 0;
    const allQuestsDone = totalQuestCount > 0 && completedCount === totalQuestCount;

    return (
        <AuthGuard>
            <DndContext
                sensors={sensors}
                onDragEnd={onQuestDragEnd}
            >
                <div className="min-h-screen bg-[#f7f6f3]">
                    <Header
                        title={`${teams.find((team) => team.id === teamId)?.name ?? teamId} 업무`}
                    />

                    <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
                        {!isGuest && (
                            <SeasonBanner teamId={teamId} currentMember={member} />
                        )}

                        {/* 프로필 카드 */}
                        <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-white to-amber-50/40 p-4 mb-3 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                                {isGuest ? (
                                    <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-xl">
                                        👤
                                    </div>
                                ) : (
                                    <Avatar name={member} size={40} />
                                )}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-stone-900">
                                            {member}
                                        </span>
                                        {isGuest ? (
                                            <span className="text-xs px-2 py-0.5 bg-stone-200 text-stone-600 rounded-full font-medium">
                                                게스트
                                            </span>
                                        ) : player ? (
                                            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                                                {lv.name}
                                            </span>
                                        ) : null}
                                    </div>
                                    {!isGuest && (
                                        <button
                                            onClick={(e) =>
                                                void handleAttend(e)
                                            }
                                            disabled={!player || attended || isAttending}
                                            title={!player ? "이 팀은 출석 체크를 지원하지 않습니다." : undefined}
                                            className={`text-xs mt-1 px-2 py-0.5 rounded-full font-medium transition-all
                    ${attended ? "bg-green-100 text-green-700" : !player ? "bg-stone-200 text-stone-400 cursor-not-allowed" : "bg-amber-500 text-white"}`}
                                        >
                                            {attended
                                                ? "출석 완료"
                                                : isAttending
                                                  ? "처리 중..."
                                                  : "출석 체크"}
                                        </button>
                                    )}
                                </div>
                                {!isGuest && (
                                    <div className="text-right text-xs text-stone-400">
                                        <div>
                                            {player?.attend_streak || 0}일
                                            연속
                                        </div>
                                        <div>
                                            이번달 {stats.exp.toLocaleString()}{" "}
                                            EXP
                                        </div>
                                    </div>
                                )}
                            </div>
                            {!isGuest && player && (
                                <div>
                                    <div className="flex justify-between text-xs text-stone-400 mb-1">
                                        <span>
                                            {player.exp.toLocaleString()}{" "}
                                            EXP
                                        </span>
                                        <span>
                                            다음 레벨까지{" "}
                                            {next
                                                ? (
                                                      next.exp - player.exp
                                                  ).toLocaleString()
                                                : 0}{" "}
                                            EXP
                                        </span>
                                    </div>
                                    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${pct}%`,
                                                background: barColor,
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                            {!isGuest && !player && !authLoading && (
                                <p className="text-xs text-stone-400 mt-1">
                                    이 팀은 퀘스트·출석·레벨 기능이 아직 설정되지 않았습니다.
                                </p>
                            )}
                        </div>

                        {!isGuest && player && (
                            <div className="mb-3 w-full min-w-0 bg-white rounded-xl border border-stone-200 p-4">
                                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-3">
                                    활동 기록
                                </p>
                                <AttendanceHeatmap member={member!} />
                            </div>
                        )}

                        {isGuest ? (
                            <>
                                <div className="bg-white rounded-xl border border-stone-200 px-4 py-3 mb-3">
                                    <p className="text-sm text-stone-500">
                                        게스트 계정으로 로그인되어 업무 현황을 확인할 수 있어요.
                                    </p>
                                </div>
                                <div className="mb-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">
                                            팀원별 업무 현황
                                        </span>
                                    </div>
                                    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                        {guestTeamSummary.map((row, i) => (
                                            <div
                                                key={row.name}
                                                className={`px-4 py-3 ${i < guestTeamSummary.length - 1 ? "border-b border-stone-100" : ""}`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar
                                                            name={row.name}
                                                            size={28}
                                                        />
                                                        <span className="text-sm font-medium text-stone-800">
                                                            {row.name}
                                                        </span>
                                                        {row.hasStarred && (
                                                            <span
                                                                className="text-xs"
                                                                title="핵심 프로젝트 있음"
                                                            >
                                                                ⭐
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-stone-500">
                                                        진행중 {row.doingCount}
                                                        건 / 완료{" "}
                                                        {row.doneCount}건
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="mb-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">
                                            마감 임박 업무
                                        </span>
                                        <span className="text-xs text-red-500 font-medium">
                                            {guestUrgentTasks.length}건
                                        </span>
                                    </div>
                                    {guestUrgentTasks.length === 0 ? (
                                        <div className="bg-white rounded-xl border border-stone-200 py-10 text-center">
                                            <p className="text-stone-400 text-sm">
                                                마감 임박 업무가 없어요
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                            {guestUrgentTasks.map((t, i) => {
                                                const diff = getDiff(
                                                    t.end_date,
                                                );
                                                return (
                                                    <div
                                                        key={t.id}
                                                        className={`flex items-center gap-3 px-4 py-3 ${i < guestUrgentTasks.length - 1 ? "border-b border-stone-100" : ""}`}
                                                    >
                                                        <Avatar
                                                            name={t.member}
                                                            size={24}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-stone-800 truncate">
                                                                {t.proj}
                                                            </p>
                                                            <p className="text-xs text-stone-400">
                                                                {t.member}
                                                            </p>
                                                        </div>
                                                        <span className="text-xs text-red-500 font-medium shrink-0">
                                                            D
                                                            {diff !== null &&
                                                            diff < 0
                                                                ? `+${Math.abs(diff)}`
                                                                : `-${diff}`}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                {/* NPC 퀘스트 */}
                                <div className="mb-3">
                                    <div className="w-full text-center">
                                        {/* NPC 클릭 영역 (말풍선 + 이미지 + 이름표) */}
                                        {/* 말풍선 */}
                                        <div className="relative mx-auto w-fit rounded-xl border border-stone-200 bg-white px-4 py-2.5 mb-8 shadow-sm">
                                            <p className="text-sm font-medium text-stone-700">전사가 되고 싶은 자는 나에게...</p>
                                            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 size-2.5 rotate-45 border-b border-r border-stone-200 bg-white" />
                                        </div>
                                        {/* NPC + 전구 버튼 */}
                                        <div className="relative inline-block">
                                            {totalQuestCount - completedCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowQuestModal(true)}
                                                    className="absolute -top-5 -right-6 z-[5] transition-transform hover:scale-110 active:scale-95"
                                                >
                                                    <div className="rounded-xl border border-stone-300 bg-white px-2 py-1.5 shadow animate-bounce">
                                                        <span className="text-lg">💡</span>
                                                    </div>
                                                    <svg className="absolute -bottom-2 left-1.5" width="12" height="10" viewBox="0 0 12 10" fill="none">
                                                        <path d="M6 0C6 0 2 4 0 10" stroke="#d6d3d1" strokeWidth="1" fill="none" />
                                                        <path d="M6.5 0C6.5 0 2.5 4 0.5 9.5" stroke="white" strokeWidth="2" fill="none" />
                                                    </svg>
                                                </button>
                                            )}
                                            {allQuestsDone && totalQuestCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowQuestModal(true)}
                                                    className="absolute -top-5 -right-6 z-[5] transition-transform hover:scale-110 active:scale-95"
                                                >
                                                    <div className="rounded-xl border border-stone-300 bg-white px-2 py-1.5 shadow">
                                                        <span className="text-lg">✅</span>
                                                    </div>
                                                    <svg className="absolute -bottom-2 left-1.5" width="12" height="10" viewBox="0 0 12 10" fill="none">
                                                        <path d="M6 0C6 0 2 4 0 10" stroke="#d6d3d1" strokeWidth="1" fill="none" />
                                                        <path d="M6.5 0C6.5 0 2.5 4 0.5 9.5" stroke="white" strokeWidth="2" fill="none" />
                                                    </svg>
                                                </button>
                                            )}
                                            <img src="/npc.webp" alt="NPC" className="w-20 h-20 object-contain" />
                                        </div>
                                        <div className="mt-0.5 mx-auto w-24 rounded bg-stone-800/80 py-px text-center leading-none">
                                            <span className="text-xs font-bold text-amber-300">주먹펴고 일어서</span>
                                        </div>
                                        {/* 퀘스트 목록 (클릭 영역 밖) */}
                                        {allQuestItems.length > 0 && (
                                            <div className="mt-3 space-y-1 text-left">
                                                {allQuestItems.slice(0, 5).map((item) => (
                                                    <div key={item.id} className="flex items-start gap-1.5">
                                                        <span className="shrink-0 text-sm leading-none mt-0.5">
                                                            {item.type === "task" ? "🗡️" : completingQuestIds.has(item.data.id) ? "✨" : "⚔️"}
                                                        </span>
                                                        <p className={`text-sm leading-snug line-clamp-1 ${item.type === "quest" && completingQuestIds.has((item.data as Quest).id) ? "line-through text-stone-400" : "text-stone-700"}`}>
                                                            {item.type === "task" ? (item.data as Task).proj : stripHtmlTags((item.data as Quest).content)}
                                                        </p>
                                                    </div>
                                                ))}
                                                {allQuestItems.length > 5 && (
                                                    <p className="text-[11px] text-stone-400">+{allQuestItems.length - 5}개 더</p>
                                                )}
                                            </div>
                                        )}
                                        {/* 프로그레스 */}
                                        {totalQuestCount > 0 && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${allQuestsDone ? "bg-green-400" : "bg-amber-400"}`}
                                                        style={{ width: `${progressPct}%` }}
                                                    />
                                                </div>
                                                <span className="shrink-0 text-[11px] font-bold text-stone-400">{completedCount}/{totalQuestCount}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 퀘스트 모달 */}
                                {showQuestModal && (
                                    <div
                                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                                        onClick={() => setShowQuestModal(false)}
                                    >
                                        <div
                                            className="w-full max-w-lg overflow-hidden rounded-xl border-2 border-amber-800/50 shadow-2xl"
                                            style={{ background: "linear-gradient(to bottom, #f5e6c8, #efe0c0)" }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {/* NPC 대화 영역 */}
                                            <div className="px-4 pt-4 pb-3 border-b-2 border-amber-800/20">
                                                <div className="flex gap-3">
                                                    <div className="shrink-0 flex flex-col items-center gap-1">
                                                        <div className="rounded-lg border-2 border-amber-800/30 bg-amber-50 p-1.5 shadow-inner">
                                                            <img src="/npc.webp" alt="NPC" className="w-16 h-16 object-contain" />
                                                        </div>
                                                        <span className="text-[11px] font-bold text-amber-900/70">주먹펴고 일어서</span>
                                                    </div>
                                                    <div className="min-w-0 flex-1 rounded-lg border border-amber-800/20 bg-white/50 px-4 py-3 shadow-inner">
                                                        <p className="whitespace-pre-line text-sm leading-relaxed text-amber-950">
                                                            {allQuestsDone && totalQuestCount > 0
                                                                ? "모든 퀘스트를 완료했구나! 대단해. 내일 다시 오거라."
                                                                : totalQuestCount === 0
                                                                ? "오늘은 할 일이 없구나... 아래에서 퀘스트를 추가해보거라."
                                                                : "아래 퀘스트를 수행하거라! ...\n⠿ 표시를 끌어서 순서를 바꿀 수 있다.\n중요한 것부터 위에 두거라."}
                                                        </p>
                                                        {totalQuestCount > 0 && (
                                                            <div className="mt-2 flex items-center gap-2">
                                                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-200/50">
                                                                    <div
                                                                        className={`h-full rounded-full transition-all duration-500 ${allQuestsDone ? "bg-green-500" : "bg-amber-600"}`}
                                                                        style={{ width: `${progressPct}%` }}
                                                                    />
                                                                </div>
                                                                <span className="shrink-0 text-xs font-bold text-amber-800">{completedCount}/{totalQuestCount}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {/* 퀘스트 목록 */}
                                            <div className="max-h-[60vh] overflow-y-auto bg-white/80">
                                                <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-800/15 bg-amber-100/30">
                                                    <span className="text-sm font-bold text-amber-900">⚔️ 퀘스트 목록</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setQuestAddEditorNonce((n) => n + 1); setShowAddQuest(true); }}
                                                        className="rounded bg-amber-700 px-2.5 py-1 text-xs font-bold text-amber-100 hover:bg-amber-800 transition-colors"
                                                    >
                                                        + 추가
                                                    </button>
                                                </div>
                                                {allQuestItems.length === 0 && completedQuestsThisSession.length === 0 ? (
                                                    <div className="py-10 text-center">
                                                        <p className="text-sm text-stone-500">퀘스트가 없어요</p>
                                                        <p className="mt-1 text-xs text-stone-400">+ 추가 버튼으로 퀘스트를 만들어보세요!</p>
                                                    </div>
                                                ) : (
                                                    <SortableContext
                                                        items={allQuestItems.map((item) => item.id)}
                                                        strategy={verticalListSortingStrategy}
                                                    >
                                                        <div className="divide-y divide-stone-100">
                                                            {allQuestItems.map((item, i) => {
                                                                const showBorderBottom = i < allQuestItems.length - 1 || completedQuestsThisSession.length > 0;
                                                                const showDragHandle = allQuestItems.length > 1;
                                                                if (item.type === "task") {
                                                                    return (
                                                                        <TodayTaskItem
                                                                            key={item.id}
                                                                            id={item.id}
                                                                            task={item.data}
                                                                            showBorderBottom={showBorderBottom}
                                                                            showDragHandle={showDragHandle}
                                                                            isCompleting={completingTaskIds.has(item.data.id)}
                                                                            onExclude={excludeToday}
                                                                        />
                                                                    );
                                                                }
                                                                return (
                                                                    <SortableQuestItem
                                                                        key={item.id}
                                                                        sortableId={item.id}
                                                                        quest={item.data}
                                                                        showBorderBottom={showBorderBottom}
                                                                        showDragHandle={showDragHandle}
                                                                        isCompleting={completingQuestIds.has(item.data.id)}
                                                                        myTasks={myTasks}
                                                                        onComplete={completeQuest}
                                                                        onEdit={openEditQuest}
                                                                        onDelete={deleteQuest}
                                                                    />
                                                                );
                                                            })}
                                                            {completedQuestsThisSession.length > 0 && (
                                                                <>
                                                                    {completedQuestsThisSession.map((q, i) => (
                                                                        <CompletedQuestItem
                                                                            key={q.id}
                                                                            quest={q}
                                                                            showBorderBottom={i < completedQuestsThisSession.length - 1}
                                                                            onUndo={undoQuest}
                                                                        />
                                                                    ))}
                                                                </>
                                                            )}
                                                        </div>
                                                    </SortableContext>
                                                )}
                                            </div>
                                            {/* 하단 닫기 */}
                                            <button
                                                type="button"
                                                onClick={() => setShowQuestModal(false)}
                                                className="w-full border-t-2 border-amber-800/20 bg-amber-900/10 py-3 text-sm font-bold text-amber-900/70 transition-colors hover:bg-amber-900/20"
                                            >
                                                닫기
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* NPC 거절 확인 모달 */}
                                {declineConfirm && (
                                    <div
                                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
                                        onClick={() => setDeclineConfirm(null)}
                                    >
                                        <div
                                            className="w-full max-w-sm overflow-hidden rounded-xl border-2 border-amber-800/50 shadow-2xl"
                                            style={{ background: "linear-gradient(to bottom, #f5e6c8, #efe0c0)" }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex gap-3 px-4 pt-4 pb-3">
                                                <div className="shrink-0">
                                                    <div className="rounded-lg border-2 border-amber-800/30 bg-amber-50 p-1.5">
                                                        <img src="/npc.webp" alt="NPC" className="w-14 h-14 object-contain" />
                                                    </div>
                                                </div>
                                                <div className="min-w-0 flex-1 rounded-lg border border-amber-800/20 bg-white/50 px-4 py-3">
                                                    <p className="text-sm font-medium text-amber-950">
                                                        {declineConfirm.type === "quest"
                                                            ? "정말이냐? 후회하게 만들어주겠다..."
                                                            : "포기하겠다고? 후회하게 만들어주겠다..."}
                                                    </p>
                                                    <p className="mt-1 text-xs text-amber-800/60">
                                                        {declineConfirm.type === "quest"
                                                            ? "이 퀘스트는 완전히 사라지게 된다."
                                                            : "오늘 목록에서 사라지지만 내일 다시 나타날 수 있다."}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                                                <button
                                                    type="button"
                                                    onClick={() => void confirmDecline()}
                                                    className="rounded-lg bg-red-500 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-600"
                                                >
                                                    포기한다
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDeclineConfirm(null)}
                                                    className="rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-700"
                                                >
                                                    역시 하겠다
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 내 업무 */}
                                <div className="mb-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">
                                            내 업무
                                        </span>
                                        <span className="text-xs text-stone-400">
                                            {activeMyTasks.length}건
                                        </span>
                                    </div>
                                    {activeMyTasks.length === 0 ? (
                                        <div className="bg-white rounded-xl border border-stone-200 py-10 text-center">
                                            <p className="text-stone-400 text-sm">
                                                진행 중인 업무가 없어요
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                                            {activeMyTasks.map((t, i) => (
                                                <HomeMyTaskRow
                                                    key={t.id}
                                                    task={t}
                                                    showBorderBottom={
                                                        i <
                                                        activeMyTasks.length - 1
                                                    }
                                                    onStatusChange={
                                                        updateTaskStatus
                                                    }
                                                    onEdit={openEditTask}
                                                    onDelete={deleteMyTask}
                                                    onCompleting={
                                                        handleTaskCompleting
                                                    }
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* 마감 임박 */}
                        {!isGuest && urgentQuests.length > 0 && (
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">
                                        마감 임박
                                    </span>
                                    <span className="text-xs text-red-500 font-medium">
                                        {urgentQuests.length}건
                                    </span>
                                </div>
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                    {urgentQuests.map((q, i) => {
                                        const diff = getDiff(q.end_date);
                                        return (
                                            <div
                                                key={q.id}
                                                className={`flex items-start gap-3 px-4 py-3 ${i < urgentQuests.length - 1 ? "border-b border-stone-100" : ""}`}
                                            >
                                                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                                                <div className="min-w-0 flex-1">
                                                    <QuestCardContent
                                                        content={q.content}
                                                    />
                                                    {q.proj && (
                                                        <p className="truncate text-xs text-stone-400">
                                                            {q.proj}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="shrink-0 self-start pt-0.5 text-xs font-medium text-red-500">
                                                    D
                                                    {diff !== null &&
                                                    diff < 0
                                                        ? "+" +
                                                          Math.abs(diff)
                                                        : "-" + diff}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 퀘스트 추가 모달 */}
                    {showAddQuest && (
                        <QuestFormModal
                            title="퀘스트 추가"
                            questForm={questForm}
                            setQuestForm={setQuestForm}
                            projects={projects}
                            editorMountKey={`a-${questAddEditorNonce}`}
                            onSubmit={addQuest}
                            onClose={() => {
                                setShowAddQuest(false);
                                setQuestForm({
                                    content: "",
                                    proj: "",
                                    end_date: "",
                                });
                            }}
                        />
                    )}

                    {/* 퀘스트 수정 모달 */}
                    {showEditQuest && editTarget && (
                        <QuestFormModal
                            title="퀘스트 수정"
                            questForm={questForm}
                            setQuestForm={setQuestForm}
                            projects={projects}
                            editorMountKey={`e-${editTarget.id}`}
                            onSubmit={saveEditQuest}
                            onClose={() => {
                                setShowEditQuest(false);
                                setEditTarget(null);
                                setQuestForm({
                                    content: "",
                                    proj: "",
                                    end_date: "",
                                });
                            }}
                            onDelete={async () => {
                                await supabase.from("quests").delete().eq("id", editTarget.id);
                                setShowEditQuest(false);
                                setEditTarget(null);
                                loadData();
                            }}
                        />
                    )}

                    {/* 내 업무 수정 모달 */}
                    {showEditTask && editTask && (
                        <div
                            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
                            style={{ marginBottom: `var(--nav-height)` }}
                            onClick={() => {
                                setShowEditTask(false);
                                setEditTask(null);
                                setEditForm({ ...EMPTY_EDIT_TASK });
                                setEditDateRange(undefined);
                                setShowEditDatePicker(false);
                            }}
                        >
                            <div
                                className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="mb-5 flex items-center justify-between">
                                    <h2 className="text-base font-bold">
                                        업무 수정
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowEditTask(false);
                                            setEditTask(null);
                                            setEditForm({ ...EMPTY_EDIT_TASK });
                                            setEditDateRange(undefined);
                                            setShowEditDatePicker(false);
                                        }}
                                        className="text-2xl leading-none text-stone-400"
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                            상태
                                        </label>
                                        <Select
                                            options={[
                                                "대기",
                                                "시작 전",
                                                "진행중",
                                                "지연/보류",
                                                "완료",
                                            ].map((s) => ({
                                                value: s,
                                                label: s,
                                            }))}
                                            value={
                                                editForm.status
                                                    ? {
                                                          value: editForm.status,
                                                          label: editForm.status,
                                                      }
                                                    : null
                                            }
                                            onChange={(opt) =>
                                                setEditForm({
                                                    ...editForm,
                                                    status: opt?.value ?? "",
                                                })
                                            }
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
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                                구분
                                            </label>
                                            <Select
                                                options={[
                                                    "프로젝트",
                                                    "유지보수",
                                                    "고도화",
                                                    "접근성",
                                                    "업무지원",
                                                ].map((t) => ({
                                                    value: t,
                                                    label: t,
                                                }))}
                                                value={
                                                    editForm.type
                                                        ? {
                                                              value: editForm.type,
                                                              label: editForm.type,
                                                          }
                                                        : null
                                                }
                                                onChange={(opt) =>
                                                    setEditForm({
                                                        ...editForm,
                                                        type: opt?.value ?? "",
                                                    })
                                                }
                                                placeholder="선택"
                                                isSearchable={false}
                                                isClearable={false}
                                                styles={modalFormSelectStyles}
                                                menuPortalTarget={
                                                    typeof document !==
                                                    "undefined"
                                                        ? document.body
                                                        : null
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                                우선순위
                                            </label>
                                            <Select
                                                options={[
                                                    "긴급",
                                                    "높음",
                                                    "보통",
                                                    "낮음",
                                                ].map((p) => ({
                                                    value: p,
                                                    label: p,
                                                }))}
                                                value={
                                                    editForm.priority
                                                        ? {
                                                              value: editForm.priority,
                                                              label: editForm.priority,
                                                          }
                                                        : null
                                                }
                                                onChange={(opt) =>
                                                    setEditForm({
                                                        ...editForm,
                                                        priority:
                                                            opt?.value ?? "",
                                                    })
                                                }
                                                placeholder="선택"
                                                isSearchable={false}
                                                isClearable={false}
                                                styles={modalFormSelectStyles}
                                                menuPortalTarget={
                                                    typeof document !==
                                                    "undefined"
                                                        ? document.body
                                                        : null
                                                }
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <div>
                                            <p className="text-sm font-medium text-stone-700">
                                                이번주 리포트 포함
                                            </p>
                                            <p className="mt-0.5 text-xs text-stone-400">
                                                주간 리포트에 이 업무를 포함합니다.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleEditIsPlan}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${editForm.is_plan ? "bg-amber-500" : "bg-stone-200"}`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                        ${editForm.is_plan ? "translate-x-6" : "translate-x-1"}`}
                                            />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <div>
                                            <p className="text-sm font-medium text-stone-700">
                                                중요 프로젝트
                                            </p>
                                            <p className="mt-0.5 text-xs text-stone-400">
                                                주간 브리핑 목록에서 강조 표시
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setEditForm((f) => ({
                                                    ...f,
                                                    is_starred: !f.is_starred,
                                                }))
                                            }
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${editForm.is_starred ? "bg-amber-500" : "bg-stone-200"}`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                        ${editForm.is_starred ? "translate-x-6" : "translate-x-1"}`}
                                            />
                                        </button>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                            프로젝트{" "}
                                            <span className="text-red-500">*</span>
                                        </label>
                                        <div className="mb-2 flex rounded-lg bg-stone-100 p-0.5">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setEditProjTab("mine")
                                                }
                                                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all
                        ${
                            editProjTab === "mine"
                                ? "bg-white text-stone-800 shadow-sm"
                                : "text-stone-400"
                        }`}
                                            >
                                                내 프로젝트
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setEditProjTab("all")
                                                }
                                                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all
                        ${
                            editProjTab === "all"
                                ? "bg-white text-stone-800 shadow-sm"
                                : "text-stone-400"
                        }`}
                                            >
                                                전체
                                            </button>
                                        </div>
                                        <Select
                                            options={editProjOptions}
                                            value={
                                                editForm.proj
                                                    ? {
                                                          value: editForm.proj,
                                                          label: editForm.proj,
                                                      }
                                                    : null
                                            }
                                            onChange={(opt) =>
                                                setEditForm({
                                                    ...editForm,
                                                    proj: opt?.value ?? "",
                                                })
                                            }
                                            placeholder="프로젝트 선택"
                                            isSearchable
                                            styles={projectSearchSelectStyles}
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
                                    <TaskContentInputs
                                        value={editForm.content}
                                        onChange={(content) =>
                                            setEditForm({
                                                ...editForm,
                                                content,
                                            })
                                        }
                                    />
                                    <HomeWorkloadInput
                                        value={editForm.workload}
                                        onChange={(v) =>
                                            setEditForm({
                                                ...editForm,
                                                workload: v,
                                            })
                                        }
                                    />
                                    <div className="relative z-20">
                                        <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                            기간
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowEditDatePicker((o) => !o)
                                            }
                                            className={`w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-left text-sm shadow-sm transition-colors
                      ${showEditDatePicker ? "border-amber-300 ring-2 ring-amber-200" : "hover:border-stone-300"}`}
                                        >
                                            <span
                                                className={
                                                    editPeriodLabel.placeholder
                                                        ? "text-stone-400"
                                                        : "text-stone-800"
                                                }
                                            >
                                                {editPeriodLabel.text}
                                            </span>
                                        </button>
                                        {showEditDatePicker &&
                                            typeof document !== "undefined" &&
                                            createPortal(
                                                <div
                                                    className="fixed inset-0 z-[200] bg-black/30"
                                                    onClick={() =>
                                                        setShowEditDatePicker(
                                                            false,
                                                        )
                                                    }
                                                    role="presentation"
                                                >
                                                    <div
                                                        className="absolute left-1/2 w-[min(calc(100vw-2rem),36rem)] -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-2xl"
                                                        style={{
                                                            bottom:
                                                                "max(5.5rem, calc(var(--nav-height, 0px) + 3.5rem))",
                                                        }}
                                                        onClick={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                    >
                                                        <div className="flex justify-center overflow-x-auto">
                                                            <DayPicker
                                                                mode="range"
                                                                selected={
                                                                    editDateRange
                                                                }
                                                                onSelect={
                                                                    setEditDateRange
                                                                }
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
                                                                    setEditDateRange(
                                                                        undefined,
                                                                    )
                                                                }
                                                                className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                                            >
                                                                초기화
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setShowEditDatePicker(
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
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!editTask || !confirm("정말 삭제할까요?")) return;
                                                void (async () => {
                                                    try { await deleteTaskFromTeamCalendar(editTask.id); } catch { /* ignore */ }
                                                    await supabase.from("tasks").delete().eq("id", editTask.id);
                                                    setShowEditTask(false);
                                                    setEditTask(null);
                                                    loadData();
                                                })();
                                            }}
                                            className="rounded-xl border border-red-300 bg-white py-3.5 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                                        >
                                            삭제하기
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void saveEditTask()}
                                            className="rounded-xl bg-stone-800 py-3.5 text-sm font-bold text-white hover:bg-stone-900 transition-colors"
                                        >
                                            저장하기
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <LevelUpOverlay
                        show={levelUpInfo.show}
                        level={levelUpInfo.level}
                        levelName={levelUpInfo.levelName}
                        onClose={closeLevelUp}
                    />
                    {mvpInfo?.show && (
                        <MvpOverlay
                            show={mvpInfo.show}
                            mvpName={mvpInfo.name}
                            weekExp={mvpInfo.weekExp}
                            taskCount={mvpInfo.taskCount}
                            onClose={() => {
                                try {
                                    localStorage.setItem(
                                        `mvp_popup_dismissed_week_${teamId}`,
                                        toSeoulYmd(),
                                    );
                                } catch {
                                    /* ignore */
                                }
                                setMvpInfo(null);
                            }}
                        />
                    )}
                    {expPopups.map((p) => (
                        <ExpPopup
                            key={p.id}
                            amount={p.amount}
                            x={p.x}
                            y={p.y}
                            type={p.type}
                            onDone={() => removeExpPopup(p.id)}
                        />
                    ))}

                    {/* ?좎뒪??*/}
                    {toast && (
                        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
                            {toast}
                        </div>
                    )}

                </div>
            </DndContext>
        </AuthGuard>
    );
}
