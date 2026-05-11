"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import type { Task, Project } from "@/lib/types";
import { getDiff, formatWorkload, normalizeProject } from "@/lib/utils";
import {
    MEMBERS,
    TYPE_COLORS,
    STATUS_COLORS,
    WORKLOAD_PRESETS,
    LEADER,
} from "@/lib/constants";
import { awardExp } from "@/lib/maple";
import AuthGuard from "@/components/AuthGuard";
import { useAuth } from "@/components/AuthProvider";
import Header from "@/components/Header";
import UserMenu from "@/components/UserMenu";
import Avatar from "@/components/Avatar";
import LevelUpOverlay from "@/components/LevelUpOverlay";
import ExpPopup, { type ExpPopupType } from "@/components/ExpPopup";
import NotificationButton from "@/components/NotificationButton";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import { PageSpinner } from "@/components/Spinner";
import { DayPicker, DateRange } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import Select from "react-select";
import { selectStyles } from "@/lib/reactSelectStyles";

const MEMBER_BORDER: Record<string, string> = {
    조현석: "border-purple-400 bg-purple-100 text-purple-700",
    조정연: "border-green-400 bg-green-100 text-green-700",
    이헌희: "border-amber-400 bg-amber-100 text-amber-700",
    이지은: "border-orange-400 bg-orange-100 text-orange-700",
};

/** 추가/수정 모달 기간 버튼 라벨 */
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

function parseYmdToLocalDate(value: string | null): Date | undefined {
    if (!value) return undefined;
    return new Date(`${value}T00:00:00`);
}

function toLocalYmd(date: Date | undefined): string | null {
    if (!date) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function getWeekWin(offset: number = 0) {
    const now = new Date();
    const day = now.getDay();
    const wed = new Date(now);
    wed.setDate(now.getDate() - ((day + 4) % 7) + offset * 7);
    wed.setHours(0, 0, 0, 0);
    const nextWed = new Date(wed);
    nextWed.setDate(wed.getDate() + 7);
    nextWed.setHours(23, 59, 59, 999);
    return {
        from: wed.toISOString().slice(0, 10),
        to: nextWed.toISOString().slice(0, 10),
        label: `${wed.getFullYear()}년 ${wed.getMonth() + 1}월 · ${wed.getMonth() + 1}/${wed.getDate()}(수)~${nextWed.getMonth() + 1}/${nextWed.getDate()}(수)`,
    };
}

const EMPTY_FORM = {
    member: "",
    type: "",
    proj: "",
    content: "",
    priority: "",
    start_date: "",
    end_date: "",
    workload: 0,
    issue: "",
    is_plan: false,
};

const EMPTY_EDIT = {
    type: "",
    proj: "",
    content: "",
    priority: "",
    workload: 0,
    issue: "",
    status: "",
    is_plan: false,
};

function WorkloadInput({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <div>
            <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-stone-500">
                    공수
                </label>
                {value > 0 && (
                    <span className="text-xs text-amber-600 font-medium">
                        {formatWorkload(value)}
                    </span>
                )}
            </div>
            <input
                type="number"
                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm mb-2"
                placeholder="분 직접 입력"
                value={value || ""}
                onChange={(e) => onChange(parseInt(e.target.value) || 0)}
            />
            <div className="flex gap-1.5 flex-wrap">
                {WORKLOAD_PRESETS.map((p) => (
                    <button
                        type="button"
                        key={p.label}
                        onClick={() => onChange(p.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                ${value === p.value ? "bg-amber-500 text-white border-amber-500" : "bg-stone-50 text-stone-600 border-stone-200"}`}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default function TasksPage() {
    const { member: currentMember, role } = useAuth();
    const isGuest = role === "guest";
    const canEditOrDelete = (taskMember: string) =>
        role !== "guest" && (role === "admin" || taskMember === currentMember);
    const assignableMembers =
        role === "admin" ? MEMBERS : [currentMember || ""];

    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editTask, setEditTask] = useState<Task | null>(null);
    const [showEdit, setShowEdit] = useState(false);
    const [form, setForm] = useState({
        ...EMPTY_FORM,
    });
    const [formDateRange, setFormDateRange] = useState<DateRange | undefined>();
    const [showFormDatePicker, setShowFormDatePicker] = useState(false);

    // 수정 모달용
    const [editForm, setEditForm] = useState(EMPTY_EDIT);
    const [editDateRange, setEditDateRange] = useState<DateRange | undefined>();
    const [showEditDatePicker, setShowEditDatePicker] = useState(false);
    const [editProjTab, setEditProjTab] = useState<"mine" | "all">("mine");

    const [filterMember, setFilterMember] = useState("");
    const [filterProject, setFilterProject] = useState("");
    const [filterPriority, setFilterPriority] = useState("");

    const [levelUpInfo, setLevelUpInfo] = useState({
        show: false,
        level: 0,
        levelName: "",
    });
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

    useEffect(() => {
        loadTasks();
        loadProjects();

        const channel = supabase
            .channel("tasks-changes-" + Math.random())
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "tasks" },
                async () => {
                    const { data } = await supabase
                        .from("tasks")
                        .select("*")
                        .order("created_at", { ascending: false });
                    setTasks(data || []);
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel).catch(console.error);
        };
    }, []);

    async function loadTasks() {
        setLoading(true);
        const { data } = await supabase
            .from("tasks")
            .select("*")
            .order("created_at", { ascending: false });
        setTasks(data || []);
        setLoading(false);
    }

    async function loadProjects() {
        const { data } = await supabase
            .from("projects")
            .select("*")
            .order("name");
        setProjects(
            (data || []).map((row) =>
                normalizeProject(row as Record<string, unknown>),
            ),
        );
    }

    const allProjOptions = useMemo(
        () =>
            projects
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((p) => ({ value: p.name, label: p.name })),
        [projects],
    );
    const addProjSelectStyles = useMemo(
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
        }),
        [],
    );

    const editMember = editTask?.member ?? "";

    const editMyProjOptions = useMemo(
        () =>
            projects
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
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((p) => ({ value: p.name, label: p.name })),
        [projects],
    );

    const editProjOptions =
        editProjTab === "mine" ? editMyProjOptions : editAllProjOptions;

    function getNextWeekRange() {
        const now = new Date();
        const day = now.getDay();
        const wed = new Date(now);
        wed.setDate(now.getDate() - ((day + 4) % 7) + 7);
        wed.setHours(0, 0, 0, 0);
        const nextWed = new Date(wed);
        nextWed.setDate(wed.getDate() + 7);
        nextWed.setHours(23, 59, 59, 999);
        return { from: wed, to: nextWed };
    }

    function toggleIsPlan() {
        const newVal = !form.is_plan;
        if (newVal) {
            const range = getNextWeekRange();
            setFormDateRange({ from: range.from, to: range.to });
        }
        setForm((f) => ({ ...f, is_plan: newVal }));
    }

    function toggleEditIsPlan() {
        const newVal = !editForm.is_plan;
        if (newVal) {
            const range = getNextWeekRange();
            setEditDateRange({ from: range.from, to: range.to });
        }
        setEditForm((f) => ({ ...f, is_plan: newVal }));
    }

    async function addTask() {
        if (!form.member || !form.proj)
            return alert("담당자와 프로젝트명은 필수예요");
        await supabase.from("tasks").insert([
            {
                member: form.member,
                type: form.type,
                proj: form.proj,
                content: form.content,
                priority: form.priority || null,
                start_date: formDateRange?.from
                    ? formDateRange.from.toISOString().slice(0, 10)
                    : null,
                end_date: formDateRange?.to
                    ? formDateRange.to.toISOString().slice(0, 10)
                    : null,
                workload: form.workload || 0,
                issue: form.issue || null,
                status: "대기",
                is_plan: form.is_plan ?? false,
            },
        ]);
        setShowModal(false);
        setForm({ ...EMPTY_FORM });
        setFormDateRange(undefined);
        setShowFormDatePicker(false);
        loadTasks();
    }

    function openEdit(task: Task) {
        setEditTask(task);
        setEditProjTab("mine");
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
        // 날짜 range 설정
        if (task.start_date || task.end_date) {
            setEditDateRange({
                from: parseYmdToLocalDate(task.start_date),
                to: parseYmdToLocalDate(task.end_date),
            });
        } else {
            setEditDateRange(undefined);
        }
        setShowEditDatePicker(false);
        setShowEdit(true);
    }

    async function saveEdit() {
        if (!editTask) return;
        await supabase
            .from("tasks")
            .update({
                type: editForm.type,
                proj: editForm.proj,
                content: editForm.content,
                priority: editForm.priority || null,
                start_date: toLocalYmd(editDateRange?.from),
                end_date: toLocalYmd(editDateRange?.to),
                workload: editForm.workload || 0,
                issue: editForm.issue || null,
                status: editForm.status,
                is_plan: editForm.is_plan ?? false,
            })
            .eq("id", editTask.id);
        setShowEdit(false);
        setEditTask(null);
        setEditForm(EMPTY_EDIT);
        setEditDateRange(undefined);
        setShowEditDatePicker(false);
        loadTasks();
    }

    async function updateStatus(
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
            // 마감일 전에 완료했으면 onTime
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
        loadTasks();
    }

    async function deleteTask(id: number) {
        if (!confirm("삭제할까요?")) return;
        await supabase.from("tasks").delete().eq("id", id);
        loadTasks();
    }

    const wk = getWeekWin();

    const filtered = tasks
        .filter((t) => {
            if (t.is_plan && t.status === "완료") return false;
            if (t.is_plan) return true;
            const s = t.start_date || t.end_date;
            const e = t.end_date || t.start_date;
            if (!s || !e) return false;
            return s <= wk.to && e >= wk.from;
        })
        .filter((t) => {
            if (filterMember && t.member !== filterMember) return false;
            if (filterProject && t.proj !== filterProject) return false;
            if (filterPriority && t.priority !== filterPriority) return false;
            return true;
        });

    const stats = {
        total: tasks.length,
        doing: tasks.filter((t) => t.status === "진행중").length,
        done: tasks.filter((t) => t.status === "완료").length,
        urgent: tasks.filter((t) => {
            const d = getDiff(t.end_date);
            return d !== null && d <= 7 && t.status !== "완료";
        }).length,
    };

    const grouped = MEMBERS.reduce(
        (acc, m) => {
            const mt = filtered.filter((t) => t.member === m);
            if (mt.length > 0) acc[m] = mt;
            return acc;
        },
        {} as Record<string, Task[]>,
    );

    const allProjects = [...new Set(tasks.map((t) => t.proj).filter(Boolean))];

    const formPeriodLabel = periodButtonLabel(formDateRange);
    const editPeriodLabel = periodButtonLabel(editDateRange);

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f7f6f3]">
                {/* 헤더 */}
                <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                    <div className="max-w-2xl mx-auto flex justify-between items-center">
                        <div>
                            <h1 className="text-base font-bold text-stone-900">
                                업무 관리
                            </h1>
                            <p className="text-xs text-stone-400 mt-0.5">
                                {wk.label}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isGuest && (
                                <button
                                    onClick={() => {
                                        setForm({
                                            ...EMPTY_FORM,
                                            member: currentMember || "",
                                        });
                                        setFormDateRange(undefined);
                                        setShowModal(true);
                                    }}
                                    className="bg-amber-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                                >
                                    + 업무
                                </button>
                            )}
                            {/* 알림 + 유저메뉴는 Header 컴포넌트 없이 직접 */}
                            <NotificationButton />
                            <UserMenu />
                        </div>
                    </div>
                </div>

                <div className="max-w-2xl mx-auto">
                    {/* 통계 */}
                    <div className="grid grid-cols-4 gap-2 px-4 py-3">
                        {[
                            { n: stats.total, l: "전체" },
                            { n: stats.doing, l: "진행중" },
                            { n: stats.done, l: "완료" },
                            { n: stats.urgent, l: "임박", red: true },
                        ].map((s) => (
                            <div
                                key={s.l}
                                className="bg-white rounded-xl border border-stone-200 p-3 text-center"
                            >
                                <div
                                    className={`text-xl font-bold ${s.red && s.n > 0 ? "text-red-500" : "text-stone-800"}`}
                                >
                                    {s.n}
                                </div>
                                <div className="text-xs text-stone-400 mt-0.5">
                                    {s.l}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 필터 */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 px-4 pb-3">
                        <div className="relative">
                            <select
                                className="w-full min-w-0 text-xs border border-stone-200 rounded-lg px-2 py-2 bg-white text-stone-600 appearance-none pr-8"
                                value={filterMember}
                                onChange={(e) =>
                                    setFilterMember(e.target.value)
                                }
                            >
                                <option value="">전체 담당자</option>
                                {MEMBERS.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                            <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                        </div>
                        <div className="relative">
                            <select
                                className="w-full min-w-0 text-xs border border-stone-200 rounded-lg px-2 py-2 bg-white text-stone-600 appearance-none pr-8"
                                value={filterProject}
                                onChange={(e) =>
                                    setFilterProject(e.target.value)
                                }
                            >
                                <option value="">전체 프로젝트</option>
                                {allProjects.map((p) => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))}
                            </select>
                            <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                        </div>
                        <div className="relative">
                            <select
                                className="w-full min-w-0 text-xs border border-stone-200 rounded-lg px-2 py-2 bg-white text-stone-600 appearance-none pr-8"
                                value={filterPriority}
                                onChange={(e) =>
                                    setFilterPriority(e.target.value)
                                }
                            >
                                <option value="">전체 우선순위</option>
                                {["긴급", "높음", "보통", "낮음"].map((p) => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))}
                            </select>
                            <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* 업무 목록 */}
                    {loading ? (
                        <PageSpinner />
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16 text-stone-400 text-sm">
                            업무가 없어요
                        </div>
                    ) : (
                        Object.entries(grouped).map(([member, memberTasks]) => (
                            <div key={member} className="px-4 mb-4">
                                <div className="flex justify-between items-center py-2">
                                    <Avatar name={member} size={26} showName />
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-stone-400">
                                            {memberTasks.length}건
                                        </span>
                                        <span className="text-xs text-amber-600 font-medium">
                                            {formatWorkload(
                                                memberTasks.reduce(
                                                    (s, t) =>
                                                        s + (t.workload || 0),
                                                    0,
                                                ),
                                            )}
                                        </span>
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                    {memberTasks.map((t, i) => {
                                        const diff = getDiff(t.end_date);
                                        const isUrgent =
                                            diff !== null &&
                                            diff <= 7 &&
                                            t.status !== "완료";
                                        const isDone = t.status === "완료";
                                        return (
                                            <div
                                                key={t.id}
                                                className={`px-4 py-3
                          ${i < memberTasks.length - 1 ? "border-b border-stone-100" : ""}
                          ${isDone ? "opacity-50" : ""}
                          ${t.priority === "긴급" || t.status === "이슈 및 대기" ? "bg-amber-50" : ""}`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            {t.priority ===
                                                                "긴급" && (
                                                                <span className="text-xs">
                                                                    ⭐
                                                                </span>
                                                            )}
                                                            {t.type && (
                                                                <span
                                                                    className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[t.type] || "bg-gray-100 text-gray-600"}`}
                                                                >
                                                                    {t.type}
                                                                </span>
                                                            )}
                                                            <span
                                                                className={`text-sm font-medium truncate ${isDone ? "line-through text-stone-400" : "text-stone-800"}`}
                                                            >
                                                                {t.proj}
                                                            </span>
                                                        </div>
                                                        {t.content && (
                                                            <p className="text-xs text-stone-400 truncate mb-1">
                                                                {t.content}
                                                            </p>
                                                        )}
                                                        {t.issue && (
                                                            <div
                                                                className={`text-xs px-2 py-1 rounded-lg mb-1 border ${
                                                                    t.priority ===
                                                                        "긴급" ||
                                                                    t.status ===
                                                                        "이슈 및 대기"
                                                                        ? "bg-amber-200 text-amber-900 border-amber-300"
                                                                        : "bg-amber-50 text-amber-700 border-amber-100"
                                                                }`}
                                                            >
                                                                이슈: {t.issue}
                                                            </div>
                                                        )}
                                                        {/* 기간 + 공수 */}
                                                        <div className="flex items-center gap-2 text-xs text-stone-400">
                                                            {t.is_plan && (
                                                                <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded font-bold shrink-0">
                                                                    작업계획
                                                                </span>
                                                            )}
                                                            {t.workload > 0 && (
                                                                <span>
                                                                    {formatWorkload(
                                                                        t.workload,
                                                                    )}
                                                                </span>
                                                            )}
                                                            {t.start_date &&
                                                                t.end_date && (
                                                                    <span
                                                                        className={
                                                                            isUrgent
                                                                                ? "text-red-500 font-medium"
                                                                                : ""
                                                                        }
                                                                    >
                                                                        {t.start_date
                                                                            .slice(
                                                                                5,
                                                                            )
                                                                            .replace(
                                                                                "-",
                                                                                "/",
                                                                            )}{" "}
                                                                        ~{" "}
                                                                        {t.end_date
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
                                                            {!t.start_date &&
                                                                t.end_date && (
                                                                    <span
                                                                        className={
                                                                            isUrgent
                                                                                ? "text-red-500 font-medium"
                                                                                : ""
                                                                        }
                                                                    >
                                                                        ~
                                                                        {t.end_date
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
                                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                        <div className="relative">
                                                            <select
                                                                value={t.status}
                                                                onChange={(
                                                                    e,
                                                                ) => {
                                                                    const el =
                                                                        e.target;
                                                                    const r =
                                                                        el.getBoundingClientRect();
                                                                    void updateStatus(
                                                                        t.id,
                                                                        el.value,
                                                                        t,
                                                                        {
                                                                            x:
                                                                                r.left +
                                                                                r.width /
                                                                                    2,
                                                                            y:
                                                                                r.top +
                                                                                r.height /
                                                                                    2,
                                                                        },
                                                                    );
                                                                }}
                                                                className={`text-xs px-2 py-1 pr-7 rounded-lg font-medium border-0 cursor-pointer appearance-none ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}
                                                                disabled={
                                                                    isGuest
                                                                }
                                                            >
                                                                {[
                                                                    "대기",
                                                                    "시작 전",
                                                                    "진행중",
                                                                    "이슈 및 대기",
                                                                    "완료",
                                                                ].map((s) => (
                                                                    <option
                                                                        key={s}
                                                                        value={
                                                                            s
                                                                        }
                                                                    >
                                                                        {s}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                                        </div>
                                                        {canEditOrDelete(
                                                            t.member,
                                                        ) && (
                                                            <>
                                                                <button
                                                                    onClick={() =>
                                                                        openEdit(
                                                                            t,
                                                                        )
                                                                    }
                                                                    className="text-xs text-stone-300 hover:text-amber-500 transition-colors"
                                                                >
                                                                    수정
                                                                </button>
                                                                <button
                                                                    onClick={() =>
                                                                        deleteTask(
                                                                            t.id,
                                                                        )
                                                                    }
                                                                    className="text-xs text-stone-300 hover:text-red-400 transition-colors"
                                                                >
                                                                    삭제
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                    <div className="h-24" />
                </div>

                {/* 업무 추가 모달 */}
                {showModal && (
                    <div
                        className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
                        style={{ marginBottom: `var(--nav-height)` }}
                        onClick={() => {
                            setShowModal(false);
                            setShowFormDatePicker(false);
                        }}
                    >
                        <div
                            className="bg-white rounded-t-2xl p-5 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-5">
                                <h2 className="text-base font-bold">
                                    업무 추가
                                </h2>
                                <button
                                    onClick={() => {
                                        setShowModal(false);
                                        setShowFormDatePicker(false);
                                    }}
                                    className="text-2xl text-stone-400 leading-none"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="space-y-4">
                                {/* 담당자 */}
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-2">
                                        담당자{" "}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {assignableMembers.map((m) => (
                                            <button
                                                key={m}
                                                onClick={() =>
                                                    setForm({
                                                        ...form,
                                                        member: m,
                                                        proj: "",
                                                    })
                                                }
                                                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all
                          ${form.member === m ? MEMBER_BORDER[m] : "bg-stone-50 border-stone-200 text-stone-400"}`}
                                            >
                                                <Avatar name={m} size={36} />
                                                <span className="text-xs font-medium">
                                                    {m.slice(1)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* 구분 + 우선순위 */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                            구분
                                        </label>
                                        <div className="relative">
                                            <select
                                                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none pr-8"
                                                value={form.type}
                                                onChange={(e) =>
                                                    setForm({
                                                        ...form,
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
                                            <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                            우선순위
                                        </label>
                                        <div className="relative">
                                            <select
                                                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none pr-8"
                                                value={form.priority}
                                                onChange={(e) =>
                                                    setForm({
                                                        ...form,
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
                                            <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                                {/* 작업 계획 토글 */}
                                <div className="flex items-center justify-between py-1">
                                    <div>
                                        <p className="text-sm font-medium text-stone-700">
                                            작업 계획
                                        </p>
                                        <p className="text-xs text-stone-400 mt-0.5">
                                            예정 업무로 등록해요
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={toggleIsPlan}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${form.is_plan ? "bg-amber-500" : "bg-stone-200"}`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                        ${form.is_plan ? "translate-x-6" : "translate-x-1"}`}
                                        />
                                    </button>
                                </div>
                                {/* 프로젝트 */}
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        프로젝트{" "}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <Select
                                        options={allProjOptions}
                                        value={
                                            form.proj
                                                ? {
                                                      value: form.proj,
                                                      label: form.proj,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setForm({
                                                ...form,
                                                proj: opt?.value ?? "",
                                            })
                                        }
                                        placeholder="프로젝트 검색"
                                        isSearchable
                                        styles={addProjSelectStyles}
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
                                {/* 업무 내용 */}
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        업무 내용
                                    </label>
                                    <textarea
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
                                        placeholder="예) 메인 슬라이드 퍼블리싱"
                                        value={form.content}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                content: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                {/* 공수 */}
                                <WorkloadInput
                                    value={form.workload}
                                    onChange={(v) =>
                                        setForm({ ...form, workload: v })
                                    }
                                />
                                {/* 기간 — 추가 모달 (오버레이 + absolute 패널) */}
                                <div className="relative z-20">
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        기간
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowFormDatePicker((o) => !o)
                                        }
                                        className={`w-full text-left border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white shadow-sm transition-colors
                      ${showFormDatePicker ? "ring-2 ring-amber-200 border-amber-300" : "hover:border-stone-300"}`}
                                    >
                                        <span
                                            className={
                                                formPeriodLabel.placeholder
                                                    ? "text-stone-400"
                                                    : "text-stone-800"
                                            }
                                        >
                                            {formPeriodLabel.text}
                                        </span>
                                    </button>
                                    {showFormDatePicker &&
                                        typeof document !== "undefined" &&
                                        createPortal(
                                            <div
                                                className="fixed inset-0 z-[200] bg-black/30"
                                                onClick={() =>
                                                    setShowFormDatePicker(false)
                                                }
                                                role="presentation"
                                            >
                                                <div
                                                    className="absolute left-1/2 w-[min(calc(100vw-2rem),36rem)] -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-2xl"
                                                    style={{
                                                        bottom: "max(5.5rem, calc(var(--nav-height, 0px) + 3.5rem))",
                                                    }}
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <div className="flex justify-center overflow-x-auto">
                                                        <DayPicker
                                                            mode="range"
                                                            selected={
                                                                formDateRange
                                                            }
                                                            onSelect={
                                                                setFormDateRange
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
                                                                setFormDateRange(
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
                                                                setShowFormDatePicker(
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
                                {/* 이슈/비고 */}
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        이슈 / 비고
                                    </label>
                                    <input
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                        placeholder="예) 클라이언트 피드백 대기..."
                                        value={form.issue}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                issue: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <button
                                    onClick={addTask}
                                    className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm"
                                >
                                    등록하기
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 업무 수정 모달 */}
                {showEdit && editTask && (
                    <div
                        className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
                        style={{ marginBottom: `var(--nav-height)` }}
                        onClick={() => {
                            setShowEdit(false);
                            setEditTask(null);
                            setEditForm(EMPTY_EDIT);
                            setEditDateRange(undefined);
                            setShowEditDatePicker(false);
                        }}
                    >
                        <div
                            className="bg-white rounded-t-2xl p-5 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-5">
                                <h2 className="text-base font-bold">
                                    업무 수정
                                </h2>
                                <button
                                    onClick={() => {
                                        setShowEdit(false);
                                        setEditTask(null);
                                        setEditForm(EMPTY_EDIT);
                                        setEditDateRange(undefined);
                                        setShowEditDatePicker(false);
                                    }}
                                    className="text-2xl text-stone-400 leading-none"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="space-y-4">
                                {/* 상태 */}
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        상태
                                    </label>
                                    <div className="relative">
                                        <select
                                            className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none pr-8"
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
                                        <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                    </div>
                                </div>
                                {/* 구분 + 우선순위 */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                            구분
                                        </label>
                                        <div className="relative">
                                            <select
                                                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none pr-8"
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
                                            <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                            우선순위
                                        </label>
                                        <div className="relative">
                                            <select
                                                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none pr-8"
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
                                            <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                                {/* 작업 계획 토글 */}
                                <div className="flex items-center justify-between py-1">
                                    <div>
                                        <p className="text-sm font-medium text-stone-700">
                                            작업 계획
                                        </p>
                                        <p className="text-xs text-stone-400 mt-0.5">
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
                                {/* 프로젝트 */}
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        프로젝트
                                    </label>
                                    <div className="flex bg-stone-100 rounded-lg p-0.5 mb-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setEditProjTab("mine")
                                            }
                                            className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all
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
                                            className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all
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
                                {/* 업무 내용 */}
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        업무 내용
                                    </label>
                                    <textarea
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
                                        value={editForm.content}
                                        onChange={(e) =>
                                            setEditForm({
                                                ...editForm,
                                                content: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                {/* 공수 */}
                                <WorkloadInput
                                    value={editForm.workload}
                                    onChange={(v) =>
                                        setEditForm({
                                            ...editForm,
                                            workload: v,
                                        })
                                    }
                                />
                                {/* 기간 — 수정 모달 (오버레이 + absolute 패널) */}
                                <div className="relative z-20">
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        기간
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowEditDatePicker((o) => !o)
                                        }
                                        className={`w-full text-left border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white shadow-sm transition-colors
                      ${showEditDatePicker ? "ring-2 ring-amber-200 border-amber-300" : "hover:border-stone-300"}`}
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
                                                    setShowEditDatePicker(false)
                                                }
                                                role="presentation"
                                            >
                                                <div
                                                    className="absolute left-1/2 w-[min(calc(100vw-2rem),36rem)] -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-2xl"
                                                    style={{
                                                        bottom: "max(5.5rem, calc(var(--nav-height, 0px) + 3.5rem))",
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
                                {/* 이슈/비고 */}
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        이슈 / 비고 (선택)
                                    </label>
                                    <input
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
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
                                    onClick={saveEdit}
                                    className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm"
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
            </div>
        </AuthGuard>
    );
}
