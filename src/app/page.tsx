"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
    calcLevel,
    getNextLevel,
    expBar,
    attendanceCheck,
    LEVELS,
    awardExp,
    EXP_REWARDS,
} from "@/lib/maple";
import { useAuth } from "@/components/AuthProvider";
import AuthGuard from "@/components/AuthGuard";
import Header from "@/components/Header";
import type { Quest, Player, Task, Project } from "@/lib/types";
import { getDiff, formatWorkload, normalizeProject } from "@/lib/utils";
import {
    BAR_COLORS,
    TYPE_COLORS,
    STATUS_COLORS,
    MEMBERS,
    WORKLOAD_PRESETS,
} from "@/lib/constants";
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
    DragOverlay,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import DragQuestModal from "@/components/DragQuestModal";
import Select from "react-select";
import { selectStyles } from "@/lib/reactSelectStyles";
import { toLocalYmd } from "@/lib/toLocalYmd";

type QuestFormType = {
    content: string;
    proj: string;
    end_date: string;
};

type QuestFormModalProps = {
    title: string;
    questForm: QuestFormType;
    setQuestForm: React.Dispatch<React.SetStateAction<QuestFormType>>;
    onSubmit: () => void;
    onClose: () => void;
    projects: Project[];
};

function QuestFormModal({
    title,
    questForm,
    setQuestForm,
    onSubmit,
    onClose,
    projects,
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
    const questModalSelectStyles = {
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
            color: "#a8a29e",
        }),
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-t-2xl p-5 w-full max-w-2xl"
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
                        <textarea
                            className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
                            placeholder="예) 메인 슬라이드 퍼블리싱"
                            value={questForm.content}
                            onChange={(e) =>
                                setQuestForm({
                                    ...questForm,
                                    content: e.target.value,
                                })
                            }
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
                            styles={questModalSelectStyles}
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
                    <button
                        onClick={onSubmit}
                        className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm"
                    >
                        {title === "퀘스트 추가" ? "추가하기" : "저장하기"}
                    </button>
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
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `task-${t.id}`,
        data: { task: t },
    });
    const diff = getDiff(t.end_date);
    const ddayRed = diff !== null && diff <= 7;
    const ddayLabel =
        diff === null ? "" : diff < 0 ? `D+${Math.abs(diff)}` : `D-${diff}`;
    return (
        <div
            ref={setNodeRef}
            className={`px-4 py-3 ${showBorderBottom ? "border-b border-stone-100" : ""} ${t.priority === "긴급" ? "bg-amber-50" : ""} ${isDragging ? "opacity-60" : ""}`}
        >
            <div className="mb-1.5 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        {t.priority === "긴급" && (
                            <span className="shrink-0 text-xs" title="긴급">
                                ⭐
                            </span>
                        )}
                        {t.type && (
                            <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[t.type] || "bg-gray-100 text-gray-600"}`}
                            >
                                {t.type}
                            </span>
                        )}
                        <span className="truncate text-sm font-medium text-stone-800">
                            {t.proj}
                        </span>
                    </div>
                    {t.content && (
                        <p className="mt-1 break-words text-xs text-stone-600">
                            {t.content}
                        </p>
                    )}
                    {t.issue && (
                        <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-100/80 px-2 py-1 text-xs text-amber-800">
                            이슈: {t.issue}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    {...listeners}
                    {...attributes}
                    className="touch-none cursor-grab px-1 text-stone-300 hover:text-stone-500 active:cursor-grabbing"
                >
                    ⠿
                </button>
            </div>
            <div className="mt-1 flex items-end justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-400">
                    {t.workload > 0 && (
                        <span>{formatWorkload(t.workload)}</span>
                    )}
                    {t.start_date && t.end_date && (
                        <span
                            className={
                                ddayRed ? "font-medium text-red-500" : ""
                            }
                        >
                            {t.start_date.slice(5).replace("-", "/")} ~{" "}
                            {t.end_date.slice(5).replace("-", "/")}
                            {ddayLabel && ` · ${ddayLabel}`}
                        </span>
                    )}
                    {!t.start_date && t.end_date && (
                        <span
                            className={
                                ddayRed ? "font-medium text-red-500" : ""
                            }
                        >
                            ~{t.end_date.slice(5).replace("-", "/")}
                            {ddayLabel && ` · ${ddayLabel}`}
                        </span>
                    )}
                    {t.workload === 0 && !t.start_date && !t.end_date && (
                        <span>기간 미정</span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {onEdit && (
                        <button
                            type="button"
                            onClick={() => onEdit(t)}
                            className="text-xs text-stone-300 transition-colors hover:text-amber-500"
                        >
                            수정
                        </button>
                    )}
                    <div className="relative shrink-0">
                        <select
                            value={t.status}
                            onChange={(e) => {
                                const el = e.target;
                                const r = el.getBoundingClientRect();
                                void onStatusChange(t.id, el.value, t, {
                                    x: r.left + r.width / 2,
                                    y: r.top + r.height / 2,
                                });
                            }}
                            className={`cursor-pointer rounded-lg border-0 px-2 py-1 pr-7 text-xs font-medium appearance-none ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}
                        >
                            {[
                                "대기",
                                "시작 전",
                                "진행중",
                                "이슈 및 대기",
                                "완료",
                            ].map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                        <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function DroppableQuestZone({ children }: { children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({ id: "quest-zone" });
    return (
        <div
            ref={setNodeRef}
            className={`min-h-[80px] rounded-xl transition-all ${isOver ? "ring-2 ring-amber-400 ring-offset-2" : ""}`}
        >
            {children}
        </div>
    );
}

export default function HomePage() {
    const { member, loading: authLoading } = useAuth();
    const router = useRouter();
    const isGuest = member === "GUEST";

    const [player, setPlayer] = useState<Player | null>(null);
    const [quests, setQuests] = useState<Quest[]>([]);
    const [myTasks, setMyTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [guestTeamTasks, setGuestTeamTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState("");
    const [showAddQuest, setShowAddQuest] = useState(false);
    const [showEditQuest, setShowEditQuest] = useState(false);
    const [editTarget, setEditTarget] = useState<Quest | null>(null);
    const [questForm, setQuestForm] = useState<QuestFormType>({
        content: "",
        proj: "",
        end_date: "",
    });
    const [activeTask, setActiveTask] = useState<Task | null>(null);
    const [dragQuestTask, setDragQuestTask] = useState<Task | null>(null);

    const [showEditTask, setShowEditTask] = useState(false);
    const [editTask, setEditTask] = useState<Task | null>(null);
    const [editForm, setEditForm] = useState({ ...EMPTY_EDIT_TASK });
    const [editDateRange, setEditDateRange] = useState<DateRange | undefined>();
    const [showEditDatePicker, setShowEditDatePicker] = useState(false);
    const [editProjTab, setEditProjTab] = useState<"mine" | "all">("mine");

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 50, tolerance: 5 },
        }),
    );

    const onDragStart = useCallback((event: DragStartEvent) => {
        const t = event.active.data.current?.task as Task | undefined;
        setActiveTask(t ?? null);
    }, []);

    const onDragEnd = useCallback((event: DragEndEvent) => {
        const t = event.active.data.current?.task as Task | undefined;
        if (event.over?.id === "quest-zone" && t) {
            setDragQuestTask(t);
        }
        setActiveTask(null);
    }, []);

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
        if (member) {
            loadData();

            // Realtime 구독
            const channel = supabase
                .channel("home-realtime")
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
    }, [member]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!member || member === "GUEST" || authLoading) return;

        const today = new Date();
        if (today.getDay() !== 1) return;

        const shownKey = `mvp_shown_${toLocalYmd(today)}`;
        if (localStorage.getItem(shownKey)) return;

        const lockKey = `mvp_lock_${shownKey}`;
        if (sessionStorage.getItem(lockKey)) return;
        sessionStorage.setItem(lockKey, "1");

        const lastMonday = new Date(today);
        lastMonday.setDate(today.getDate() - 7);
        const lastSunday = new Date(today);
        lastSunday.setDate(today.getDate() - 1);
        const startYmd = toLocalYmd(lastMonday);
        const endYmd = toLocalYmd(lastSunday);

        const markShown = () => {
            try {
                localStorage.setItem(shownKey, "1");
            } catch {
                /* ignore */
            }
        };

        void (async () => {
            try {
                const { data: players, error: pErr } = await supabase
                    .from("players")
                    .select("*");
                if (pErr || !players?.length) {
                    sessionStorage.removeItem(lockKey);
                    return;
                }

                const { data: tasks, error: tErr } = await supabase
                    .from("tasks")
                    .select("member, end_date")
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

                setMvpInfo({
                    show: true,
                    name: best.name,
                    weekExp: best.weekExp,
                    taskCount: best.taskCount,
                });
                markShown();
            } catch {
                sessionStorage.removeItem(lockKey);
            }
        })();
    }, [member, authLoading]);

    if (authLoading) return <PageSpinner />;
    if (!member) return null;

    async function loadData() {
        setLoading(true);
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
                .eq("name", member)
                .maybeSingle(),
            supabase
                .from("quests")
                .select("*")
                .eq("member", member)
                .neq("status", "완료")
                .order("end_date", { ascending: true }),
            supabase
                .from("tasks")
                .select("*")
                .eq("member", member)
                .order("end_date", { ascending: true }),
            isGuest
                ? supabase
                      .from("tasks")
                      .select("*")
                      .order("end_date", { ascending: true })
                : Promise.resolve({ data: [] as Task[] }),
            supabase
                .from("projects")
                .select("*")
                .order("name", { ascending: true }),
        ]);
        setPlayer(playerData);
        setQuests(questData || []);
        setMyTasks(myTaskData || []);
        setGuestTeamTasks(guestTaskData || []);
        setProjects(
            (projData || []).map((row) =>
                normalizeProject(row as Record<string, unknown>),
            ),
        );
        setLoading(false);
    }

    function showToastMsg(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    }

    async function handleAttend(e: React.MouseEvent) {
        if (!player || !member) return;
        const today = toLocalYmd(new Date());
        if (player.attend_last === today) {
            showToastMsg("오늘은 이미 출석했어요!");
            return;
        }
        const result = await attendanceCheck(member);
        if (!result.success) {
            showToastMsg(result.message || "오류");
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
                `☀️ 출석 완료! +${result.exp} EXP · ${result.streak}일 연속`,
            );
        }
        loadData();
    }

    async function completeQuest(quest: Quest, e: React.MouseEvent) {
        if (!member) return;
        await supabase
            .from("quests")
            .update({ status: "완료" })
            .eq("id", quest.id);
        const result = await awardExp(member, "QUEST");
        if (result?.amount != null) {
            pushExpPopup(result.amount, e.clientX, e.clientY, "quest");
        }
        if (result?.levelUp && result.newLv) {
            setLevelUpInfo({
                show: true,
                level: result.newLv.level,
                levelName: result.newLv.name,
            });
        } else {
            showToastMsg(`⚔️ 완료! +${result?.amount} EXP`);
        }
        loadData();
    }

    async function addQuest() {
        if (!questForm.content) return alert("퀘스트 내용은 필수예요");
        await supabase.from("quests").insert([
            {
                member: member,
                content: questForm.content,
                proj: questForm.proj || null,
                end_date: questForm.end_date || null,
                task_id: null,
                status: "대기",
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

    async function deleteQuest(id: number) {
        if (!confirm("삭제할까요?")) return;
        await supabase.from("quests").delete().eq("id", id);
        loadData();
    }

    function openEditQuest(quest: Quest) {
        setEditTarget(quest);
        setQuestForm({
            content: quest.content,
            proj: quest.proj || "",
            end_date: quest.end_date || "",
        });
        setShowEditQuest(true);
    }

    async function saveEditQuest() {
        if (!editTarget) return;
        await supabase
            .from("quests")
            .update({
                content: questForm.content,
                proj: questForm.proj || null,
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

    async function submitDragQuest(
        content: string,
        endDate: string,
        task: Task,
    ) {
        if (!member) return;
        await supabase.from("quests").insert([
            {
                member,
                content,
                proj: task.proj || null,
                end_date: endDate || null,
                task_id: task.id,
                status: "대기",
            },
        ]);
        loadData();
    }

    async function updateTaskStatus(
        id: number,
        status: string,
        task: Task,
        anchor?: { x: number; y: number },
    ) {
        const prev = task.status;
        await supabase.from("tasks").update({ status }).eq("id", id);
        if (status === "완료" && prev !== "완료") {
            const type = task.priority === "긴급" ? "URGENT" : "COMPLETE";
            const isUrgent = task.priority === "긴급";
            const diff = getDiff(task.end_date);
            const isOnTime = diff !== null && diff >= 0;
            const result = await awardExp(
                task.member,
                type,
                true,
                isUrgent,
                isOnTime,
            );
            if (result?.amount != null && anchor) {
                pushExpPopup(
                    result.amount,
                    anchor.x,
                    anchor.y,
                    task.priority === "긴급" ? "urgent" : "complete",
                );
            }
            if (result?.levelUp && result.newLv) {
                setLevelUpInfo({
                    show: true,
                    level: result.newLv.level,
                    levelName: result.newLv.name,
                });
            }
        }
        if (prev === "완료" && status !== "완료") {
            const isUrgent = task.priority === "긴급";
            await awardExp(
                task.member,
                task.priority === "긴급" ? "URGENT" : "COMPLETE",
                false,
                isUrgent,
            );
        }
        loadData();
    }

    function getNextWeekRange() {
        const now = new Date();
        const day = now.getDay();
        // 다음 주 수요일 (로컬 기준)
        const wed = new Date(now);
        wed.setDate(now.getDate() - ((day + 4) % 7) + 7);
        wed.setHours(0, 0, 0, 0);
        const nextWed = new Date(wed);
        nextWed.setDate(wed.getDate() + 7);
        nextWed.setHours(23, 59, 59, 999);
        return {
            from: wed,
            to: nextWed,
        };
    }

    function toggleEditIsPlan() {
        const newVal = !editForm.is_plan;
        if (newVal) {
            const range = getNextWeekRange();
            setEditDateRange({ from: range.from, to: range.to });
        }
        setEditForm((f) => ({ ...f, is_plan: newVal }));
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
        await supabase
            .from("tasks")
            .update({
                type: editForm.type,
                proj: editForm.proj,
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
            })
            .eq("id", editTask.id);
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

    const guestTeamSummary = MEMBERS.map((name) => {
        const memberTasks = guestTeamTasks.filter((t) => t.member === name);
        const doingCount = memberTasks.filter(
            (t) => t.status !== "완료",
        ).length;
        const doneCount = memberTasks.filter((t) => t.status === "완료").length;
        const hasUrgent = memberTasks.some(
            (t) => t.status !== "완료" && t.priority === "긴급",
        );
        return { name, doingCount, doneCount, hasUrgent };
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

    return (
        <AuthGuard>
            <DndContext
                sensors={sensors}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
            >
                <div className="min-h-screen bg-[#f7f6f3]">
                    <Header title="UD2팀 업무" />

                    <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
                        {/* 프로필 카드 */}
                        <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-3">
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
                                        ) : (
                                            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                                                {lv.name}
                                            </span>
                                        )}
                                    </div>
                                    {!isGuest && (
                                        <button
                                            onClick={(e) =>
                                                void handleAttend(e)
                                            }
                                            disabled={attended}
                                            className={`text-xs mt-1 px-2 py-0.5 rounded-full font-medium transition-all
                    ${attended ? "bg-green-100 text-green-700" : "bg-amber-500 text-white"}`}
                                        >
                                            {attended
                                                ? "✅ 출석완료"
                                                : "☀️ 출석 체크"}
                                        </button>
                                    )}
                                </div>
                                {!isGuest && (
                                    <div className="text-right text-xs text-stone-400">
                                        <div>
                                            🔥 {player?.attend_streak || 0}일
                                            연속
                                        </div>
                                        <div>
                                            이달 {stats.exp.toLocaleString()}{" "}
                                            EXP
                                        </div>
                                    </div>
                                )}
                            </div>
                            {!isGuest && (
                                <div>
                                    <div className="flex justify-between text-xs text-stone-400 mb-1">
                                        <span>
                                            {player?.exp.toLocaleString() || 0}{" "}
                                            EXP
                                        </span>
                                        <span>
                                            다음 레벨까지{" "}
                                            {next
                                                ? (
                                                      next.exp -
                                                      (player?.exp || 0)
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
                        </div>

                        {!isGuest && (
                            <div className="mb-3 w-full min-w-0 bg-white rounded-xl border border-stone-200 p-4">
                                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-3">
                                    활동 기록
                                </p>
                                <AttendanceHeatmap member={member ?? ""} />
                            </div>
                        )}

                        {isGuest ? (
                            <>
                                <div className="bg-white rounded-xl border border-stone-200 px-4 py-3 mb-3">
                                    <p className="text-sm text-stone-500">
                                        게스트 계정으로 로그인되었어요. 업무
                                        현황을 확인할 수 있어요.
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
                                                        {row.hasUrgent && (
                                                            <span
                                                                className="text-xs"
                                                                title="긴급 업무 있음"
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
                                {/* 스탯 */}
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                    {[
                                        {
                                            icon: "☀️",
                                            label: "출석체크",
                                            value: attended ? "완료" : "미완료",
                                            onClick: (ev: React.MouseEvent) =>
                                                void handleAttend(ev),
                                            highlight: !attended,
                                        },
                                        {
                                            icon: "📋",
                                            label: "퀘스트",
                                            value: quests.length,
                                            onClick: null,
                                            highlight: false,
                                        },
                                        {
                                            icon: "📊",
                                            label: "월 EXP",
                                            value: stats.exp,
                                            onClick: null,
                                            highlight: false,
                                        },
                                    ].map((s) => (
                                        <button
                                            key={s.label}
                                            onClick={s.onClick || undefined}
                                            className={`rounded-xl border p-2.5 text-center transition-all
                  ${s.highlight ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-stone-200 text-stone-800"}`}
                                        >
                                            <div className="text-lg">
                                                {s.icon}
                                            </div>
                                            <div className="text-sm font-bold mt-0.5">
                                                {s.value}
                                            </div>
                                            <div
                                                className={`text-xs mt-0.5 ${s.highlight ? "text-amber-100" : "text-stone-400"}`}
                                            >
                                                {s.label}
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* 오늘의 퀘스트 */}
                                <div className="mb-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wide text-stone-500">
                                            오늘의 퀘스트
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-amber-600">
                                                완료 시 EXP 지급
                                            </span>
                                            <button
                                                onClick={() =>
                                                    setShowAddQuest(true)
                                                }
                                                className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-medium text-white"
                                            >
                                                + 추가
                                            </button>
                                        </div>
                                    </div>

                                    <DroppableQuestZone>
                                        {quests.length === 0 ? (
                                            <div className="rounded-xl border border-stone-200 bg-white py-10 text-center">
                                                <p className="text-sm text-stone-400">
                                                    오늘 퀘스트가 없어요
                                                </p>
                                                <p className="mt-1 text-xs text-stone-300">
                                                    + 추가 버튼으로 퀘스트를
                                                    만들어보세요!
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                                                {quests.map((q, i) => {
                                                    const diff = getDiff(
                                                        q.end_date,
                                                    );
                                                    const linkedProj =
                                                        q.task_id != null
                                                            ? myTasks.find(
                                                                  (t) =>
                                                                      Number(
                                                                          t.id,
                                                                      ) ===
                                                                      Number(
                                                                          q.task_id,
                                                                      ),
                                                              )?.proj
                                                            : undefined;
                                                    return (
                                                        <div
                                                            key={q.id}
                                                            className={`flex items-center gap-3 px-4 py-3
                        ${i < quests.length - 1 ? "border-b border-stone-100" : ""}`}
                                                        >
                                                            <button
                                                                onClick={(ev) =>
                                                                    void completeQuest(
                                                                        q,
                                                                        ev,
                                                                    )
                                                                }
                                                                className="h-5 w-5 shrink-0 rounded-full border-2 border-stone-300 transition-colors hover:border-amber-500"
                                                            />
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-sm font-medium text-stone-800">
                                                                    {q.content}
                                                                </p>
                                                                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                                                    {(q.proj ||
                                                                        linkedProj) && (
                                                                        <span className="truncate text-xs text-stone-400">
                                                                            {q.proj ||
                                                                                linkedProj}
                                                                        </span>
                                                                    )}
                                                                    {q.end_date && (
                                                                        <span
                                                                            className={`text-xs font-medium ${diff !== null && diff <= 3 ? "text-red-500" : "text-stone-400"}`}
                                                                        >
                                                                            {q.end_date
                                                                                .slice(
                                                                                    5,
                                                                                )
                                                                                .replace(
                                                                                    "-",
                                                                                    "/",
                                                                                )}
                                                                            {diff !==
                                                                                null &&
                                                                                ` D${diff < 0 ? "+" + Math.abs(diff) : "-" + diff}`}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-1.5">
                                                                <span className="text-xs font-medium text-green-600">
                                                                    +10 EXP
                                                                </span>
                                                                <button
                                                                    onClick={() =>
                                                                        openEditQuest(
                                                                            q,
                                                                        )
                                                                    }
                                                                    className="text-xs text-stone-300 transition-colors hover:text-amber-500"
                                                                >
                                                                    수정
                                                                </button>
                                                                <button
                                                                    onClick={() =>
                                                                        deleteQuest(
                                                                            q.id,
                                                                        )
                                                                    }
                                                                    className="text-xs text-stone-300 transition-colors hover:text-red-400"
                                                                >
                                                                    삭제
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </DroppableQuestZone>
                                </div>

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
                                                className={`flex items-center gap-3 px-4 py-3 ${i < urgentQuests.length - 1 ? "border-b border-stone-100" : ""}`}
                                            >
                                                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-stone-800 truncate">
                                                        {q.content}
                                                    </p>
                                                    {q.proj && (
                                                        <p className="text-xs text-stone-400 truncate">
                                                            {q.proj}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="text-xs text-red-500 font-medium shrink-0">
                                                    D
                                                    {diff !== null && diff < 0
                                                        ? "+" + Math.abs(diff)
                                                        : "-" + diff}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {!isGuest && (
                        <DragOverlay className="pointer-events-none">
                            {activeTask && (
                                <div className="box-border w-[min(calc(100vw-2rem),42rem)] max-w-2xl rounded-xl border-2 border-amber-400 bg-white px-4 py-3 text-sm font-medium text-stone-800 opacity-90 shadow-xl">
                                    {activeTask.proj}
                                </div>
                            )}
                        </DragOverlay>
                    )}

                    {/* 퀘스트 추가 모달 */}
                    {showAddQuest && (
                        <QuestFormModal
                            title="퀘스트 추가"
                            questForm={questForm}
                            setQuestForm={setQuestForm}
                            projects={projects}
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
                    {showEditQuest && (
                        <QuestFormModal
                            title="퀘스트 수정"
                            questForm={questForm}
                            setQuestForm={setQuestForm}
                            projects={projects}
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
                                className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
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
                                        <div className="relative">
                                            <select
                                                className="w-full appearance-none rounded-lg border border-stone-200 bg-white px-3 py-2.5 pr-8 text-sm"
                                                value={editForm.status}
                                                onChange={(e) =>
                                                    setEditForm({
                                                        ...editForm,
                                                        status: e.target.value,
                                                    })
                                                }
                                            >
                                                {[
                                                    "대기",
                                                    "시작 전",
                                                    "진행중",
                                                    "이슈 및 대기",
                                                    "완료",
                                                ].map((s) => (
                                                    <option key={s}>{s}</option>
                                                ))}
                                            </select>
                                            <i className="ri-arrow-down-s-line pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                                구분
                                            </label>
                                            <div className="relative">
                                                <select
                                                    className="w-full appearance-none rounded-lg border border-stone-200 bg-white px-3 py-2.5 pr-8 text-sm"
                                                    value={editForm.type}
                                                    onChange={(e) =>
                                                        setEditForm({
                                                            ...editForm,
                                                            type: e.target.value,
                                                        })
                                                    }
                                                >
                                                    <option value="">선택</option>
                                                    {[
                                                        "프로젝트",
                                                        "유지보수",
                                                        "고도화",
                                                        "접근성",
                                                        "업무지원",
                                                    ].map((t) => (
                                                        <option key={t}>{t}</option>
                                                    ))}
                                                </select>
                                                <i className="ri-arrow-down-s-line pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                                우선순위
                                            </label>
                                            <div className="relative">
                                                <select
                                                    className="w-full appearance-none rounded-lg border border-stone-200 bg-white px-3 py-2.5 pr-8 text-sm"
                                                    value={editForm.priority}
                                                    onChange={(e) =>
                                                        setEditForm({
                                                            ...editForm,
                                                            priority:
                                                                e.target.value,
                                                        })
                                                    }
                                                >
                                                    <option value="">선택</option>
                                                    {[
                                                        "긴급",
                                                        "높음",
                                                        "보통",
                                                        "낮음",
                                                    ].map((p) => (
                                                        <option key={p}>{p}</option>
                                                    ))}
                                                </select>
                                                <i className="ri-arrow-down-s-line pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <div>
                                            <p className="text-sm font-medium text-stone-700">
                                                작업 계획
                                            </p>
                                            <p className="mt-0.5 text-xs text-stone-400">
                                                예정 업무로 등록해요
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
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                            프로젝트
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
                                            styles={selectStyles}
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
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                            업무 내용
                                        </label>
                                        <textarea
                                            className="h-20 w-full resize-none rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                                            value={editForm.content}
                                            onChange={(e) =>
                                                setEditForm({
                                                    ...editForm,
                                                    content: e.target.value,
                                                })
                                            }
                                        />
                                    </div>
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
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                            이슈 / 비고 (선택)
                                        </label>
                                        <input
                                            className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                                            placeholder="예) 클라이언트 피드백 대기..."
                                            value={editForm.issue}
                                            onChange={(e) =>
                                                setEditForm({
                                                    ...editForm,
                                                    issue: e.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void saveEditTask()}
                                        className="w-full rounded-xl bg-amber-500 py-3.5 text-sm font-bold text-white"
                                    >
                                        저장하기
                                    </button>
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
                            onClose={() => setMvpInfo(null)}
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

                    {/* 토스트 */}
                    {toast && (
                        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
                            {toast}
                        </div>
                    )}

                    {dragQuestTask && (
                        <DragQuestModal
                            task={dragQuestTask}
                            onClose={() => setDragQuestTask(null)}
                            onSubmit={(content, endDate) =>
                                submitDragQuest(content, endDate, dragQuestTask)
                            }
                        />
                    )}
                </div>
            </DndContext>
        </AuthGuard>
    );
}
