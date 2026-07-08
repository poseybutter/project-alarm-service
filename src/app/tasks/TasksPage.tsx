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
    TEAM_ID,
    normalizeStatus,
} from "@/lib/constants";
import { rpcSetTaskStatus } from "@/lib/maple";
import AuthGuard from "@/components/AuthGuard";
import { useAuth } from "@/components/AuthProvider";
import Tooltip from "@/components/Tooltip";
import UserMenu from "@/components/UserMenu";
import Avatar from "@/components/Avatar";
import LevelUpOverlay from "@/components/LevelUpOverlay";
import ExpPopup, { type ExpPopupType } from "@/components/ExpPopup";
import AgentButton from "@/components/AgentButton";
import NotificationButton from "@/components/NotificationButton";
import TaskEditModal from "@/components/TaskEditModal";
import TaskContentInputs from "@/components/TaskContentInputs";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import { PageSpinner } from "@/components/Spinner";
import { DayPicker, DateRange } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import Select from "react-select";
import {
    projectSearchSelectStyles,
    taskFilterProjectSelectStyles,
    modalFormSelectStyles,
    badgeSelectStyles,
} from "@/lib/reactSelectStyles";
import { toLocalYmd } from "@/lib/toLocalYmd";

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
    is_starred: false,
    show_on_team_calendar: true,
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

const STATUS_OPTIONS = [
    "대기",
    "시작 전",
    "진행중",
    "지연/보류",
    "완료",
].map((s) => ({ value: s, label: s }));

function TaskStatusBadgeSelect({
    task,
    disabled,
    onChange,
}: {
    task: Task;
    disabled: boolean;
    onChange: (
        id: number,
        status: string,
        task: Task,
        anchor: { x: number; y: number },
    ) => void;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    return (
        <div
            ref={wrapRef}
            className={`rounded-lg ${STATUS_COLORS[task.status] || "bg-gray-100 text-gray-600"} ${disabled ? "opacity-70" : ""}`}
        >
            <Select
                options={STATUS_OPTIONS}
                value={{ value: task.status, label: task.status }}
                isDisabled={disabled}
                onChange={(opt) => {
                    if (!opt) return;
                    const r = wrapRef.current?.getBoundingClientRect();
                    onChange(task.id, opt.value, task, {
                        x: (r?.left ?? 0) + (r?.width ?? 0) / 2,
                        y: (r?.top ?? 0) + (r?.height ?? 0) / 2,
                    });
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

export default function TasksPage() {
    const { member: currentMember, role } = useAuth();
    const isGuest = role === "guest";
    const canEditOrDelete = (taskMember: string) =>
        role !== "guest" && (role === "admin" || taskMember === currentMember);
    const assignableMembers =
        role === "admin" ? MEMBERS : [currentMember || ""];

    const [tasks, setTasks] = useState<Task[]>([]);
    const [toast, setToast] = useState("");
    function showToastMsg(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    }
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editTask, setEditTask] = useState<Task | null>(null);
    const [form, setForm] = useState({
        ...EMPTY_FORM,
    });
    const [formDateRange, setFormDateRange] = useState<DateRange | undefined>();
    const [showFormDatePicker, setShowFormDatePicker] = useState(false);
    const [formProjTab, setFormProjTab] = useState<"mine" | "all">("mine");

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
                        .eq("team_id", TEAM_ID)
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
            .eq("team_id", TEAM_ID)
            .order("created_at", { ascending: false });
        setTasks(data || []);
        setLoading(false);
    }

    async function loadProjects() {
        const { data } = await supabase
            .from("projects")
            .select("*")
            .eq("team_id", TEAM_ID)
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
                .filter((p) => !p.is_archived)
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((p) => ({ value: p.name, label: p.name })),
        [projects],
    );

    const formMyProjOptions = useMemo(
        () =>
            projects
                .filter((p) => !p.is_archived)
                .filter(
                    (p) =>
                        form.member &&
                        ((p.members || []).includes(form.member) ||
                            p.member === form.member),
                )
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((p) => ({ value: p.name, label: p.name })),
        [projects, form.member],
    );

    const formProjOptions =
        formProjTab === "mine" ? formMyProjOptions : allProjOptions;

    function toggleIsPlan() {
        setForm((f) => ({ ...f, is_plan: !f.is_plan }));
    }

    function toggleTeamCalendar() {
        if (
            !form.show_on_team_calendar &&
            !formDateRange?.from &&
            !formDateRange?.to
        ) {
            showToastMsg("팀 캘린더에 표시하려면 시작일이나 마감일을 먼저 선택해주세요");
            return;
        }
        setForm((f) => ({
            ...f,
            show_on_team_calendar: !f.show_on_team_calendar,
        }));
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

    async function addTask() {
        if (!form.member || !form.proj)
            return alert("담당자와 프로젝트명은 필수예요");
        if (
            !formDateRange?.from &&
            !formDateRange?.to
        ) {
            showToastMsg("업무 캘린더 등록을 위해 기간 또는 마감일을 선택해주세요");
            return;
        }
        const { data, error } = await supabase
            .from("tasks")
            .insert([
                {
                    member: form.member,
                    type: form.type,
                    proj: form.proj,
                    content: form.content,
                    priority: form.priority || null,
                    start_date: formDateRange?.from
                        ? toLocalYmd(formDateRange.from)
                        : null,
                    end_date: formDateRange?.to
                        ? toLocalYmd(formDateRange.to)
                        : null,
                    workload: form.workload || 0,
                    issue: form.issue || null,
                    status: "대기",
                    is_plan: form.is_plan ?? false,
                    is_starred: form.is_starred ?? false,
                    show_on_team_calendar: true,
                    team_id: TEAM_ID,
                },
            ])
            .select("id")
            .single();
        if (error) {
            showToastMsg("업무 등록에 실패했어요");
            return;
        }
        if (data?.id) {
            void syncTaskToTeamCalendar(data.id).catch((err) => {
                showToastMsg(
                    err instanceof Error
                        ? err.message
                        : "팀 캘린더 동기화 실패",
                );
            });
        }
        setShowModal(false);
        setForm({ ...EMPTY_FORM });
        setFormDateRange(undefined);
        setShowFormDatePicker(false);
        loadTasks();
    }

    function openEdit(task: Task) {
        setEditTask(task);
    }

    async function updateStatus(
        id: number,
        status: string,
        task: Task,
        anchor?: { x: number; y: number },
    ) {
        // ?곹깭 蹂寃?+ ?먯닔???쒕쾭 RPC 媛 ?먯옄?곸쑝濡?泥섎━(?꾨즺/湲닿툒/?뺤떆 ?먯젙 紐⑤몢 ?쒕쾭痢?.
        // 沅뚰븳 ?놁쑝硫?RPC 媛 throw ???좎뒪??
        const result = await rpcSetTaskStatus(id, status, task.member).catch(
            () => null,
        );
        if (!result) {
            showToastMsg("권한이 없어 상태를 변경할 수 없어요");
            return;
        }
        // ?꾨즺 "吏꾩엯"(sign>0)???뚮쭔 EXP ?앹뾽/?덈꺼???곗텧.
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
        void syncTaskToTeamCalendar(id).catch((err) => {
            showToastMsg(
                err instanceof Error
                    ? err.message
                    : "팀 캘린더 동기화 실패",
            );
        });
        loadTasks();
    }

    async function deleteTask(id: number) {
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
        const { data, error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", id)
            .select();
        if (error || !data || data.length === 0) {
            showToastMsg("권한이 없어 삭제할 수 없어요");
            return;
        }
        loadTasks();
    }

    const filtered = tasks
        .filter((t) => {
            return normalizeStatus(t.status) !== "완료";
        })
        .filter((t) => {
            if (filterMember && t.member !== filterMember) return false;
            if (filterProject && t.proj !== filterProject) return false;
            if (filterPriority && t.priority !== filterPriority) return false;
            return true;
        });

    const grouped = MEMBERS.reduce(
        (acc, m) => {
            const mt = filtered.filter((t) => t.member === m);
            if (mt.length > 0) acc[m] = mt;
            return acc;
        },
        {} as Record<string, Task[]>,
    );

    const filterProjectSelectOptions = useMemo(
        () =>
            [...new Set(tasks.map((t) => t.proj).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, "ko"))
                .map((p) => ({ value: p, label: p })),
        [tasks],
    );

    const formPeriodLabel = periodButtonLabel(formDateRange);

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f7f6f3]">
                {/* ?ㅻ뜑 */}
                <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                    <div className="max-w-2xl mx-auto flex justify-between items-center">
                        <div>
                            <h1 className="text-base font-bold text-stone-900">
                                업무 관리
                            </h1>
                            <p className="text-xs text-stone-400 mt-0.5">
                                미완료 업무를 관리하고 리포트 포함 여부를 조정합니다.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isGuest && (
                                <button
                                    onClick={() => {
                                        setFormProjTab("mine");
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
                            {/* ?뚮┝ + ?좎?硫붾돱??Header 而댄룷?뚰듃 ?놁씠 吏곸젒 */}
                            <AgentButton />
                            <NotificationButton />
                            <UserMenu />
                        </div>
                    </div>
                </div>

                <div className="max-w-2xl mx-auto pb-24">
                    {/* ?꾪꽣 */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 px-4 py-3">
                        <div className="min-w-0">
                            <Select
                                options={MEMBERS.map((m) => ({
                                    value: m,
                                    label: m,
                                }))}
                                value={
                                    filterMember
                                        ? {
                                              value: filterMember,
                                              label: filterMember,
                                          }
                                        : null
                                }
                                onChange={(opt) =>
                                    setFilterMember(opt?.value ?? "")
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
                        <div className="min-w-0">
                            <Select
                                options={filterProjectSelectOptions}
                                value={
                                    filterProject
                                        ? {
                                              value: filterProject,
                                              label: filterProject,
                                          }
                                        : null
                                }
                                onChange={(opt) =>
                                    setFilterProject(opt?.value ?? "")
                                }
                                placeholder="전체 프로젝트"
                                isClearable
                                isSearchable
                                styles={taskFilterProjectSelectStyles}
                                menuPortalTarget={
                                    typeof document !== "undefined"
                                        ? document.body
                                        : null
                                }
                                noOptionsMessage={() => "프로젝트가 없어요"}
                            />
                        </div>
                        <div className="min-w-0">
                            <Select
                                options={["긴급", "높음", "보통", "낮음"].map(
                                    (p) => ({ value: p, label: p }),
                                )}
                                value={
                                    filterPriority
                                        ? {
                                              value: filterPriority,
                                              label: filterPriority,
                                          }
                                        : null
                                }
                                onChange={(opt) =>
                                    setFilterPriority(opt?.value ?? "")
                                }
                                placeholder="전체 우선순위"
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

                    {/* ?낅Т 紐⑸줉 */}
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
                          ${t.priority === "긴급" || normalizeStatus(t.status) === "지연/보류" ? "bg-amber-50" : ""}`}
                                            >
                                                <div className="flex gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            {t.is_starred && (
                                                                <span
                                                                    className="text-xs"
                                                                    title="중요 프로젝트"
                                                                >
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
                                                                    normalizeStatus(
                                                                        t.status,
                                                                    ) ===
                                                                        "지연/보류"
                                                                        ? "bg-amber-200 text-amber-900 border-amber-300"
                                                                        : "bg-amber-50 text-amber-700 border-amber-100"
                                                                }`}
                                                            >
                                                                이슈: {t.issue}
                                                            </div>
                                                        )}
                                                        {/* 湲곌컙 + 怨듭닔 */}
                                                        <div className="flex items-center gap-2 text-xs text-stone-400">
                                                            {t.is_plan && (
                                                                <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded font-bold shrink-0">
                                                                    리포트 포함
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
                                                    <div className="flex flex-col justify-between items-end gap-1.5 shrink-0">
                                                        <TaskStatusBadgeSelect
                                                            task={t}
                                                            disabled={
                                                                isGuest ||
                                                                !canEditOrDelete(
                                                                    t.member,
                                                                )
                                                            }
                                                            onChange={(
                                                                id,
                                                                status,
                                                                task,
                                                                anchor,
                                                            ) =>
                                                                void updateStatus(
                                                                    id,
                                                                    status,
                                                                    task,
                                                                    anchor,
                                                                )
                                                            }
                                                        />
                                                        {canEditOrDelete(
                                                            t.member,
                                                        ) && (
                                                            <div className="flex items-center gap-2">
                                                                <Tooltip label="?섏젙">
                                                                    <button
                                                                        onClick={() =>
                                                                            openEdit(
                                                                                t,
                                                                            )
                                                                        }
                                                                        aria-label="?섏젙"
                                                                        className="text-base text-stone-300 hover:text-amber-500 transition-colors"
                                                                    >
                                                                        <i
                                                                            className="ri-edit-line"
                                                                            aria-hidden
                                                                        />
                                                                    </button>
                                                                </Tooltip>
                                                                <Tooltip label="??젣">
                                                                    <button
                                                                        onClick={() =>
                                                                            deleteTask(
                                                                                t.id,
                                                                            )
                                                                        }
                                                                        aria-label="??젣"
                                                                        className="text-base text-stone-300 hover:text-red-400 transition-colors"
                                                                    >
                                                                        <i
                                                                            className="ri-delete-bin-line"
                                                                            aria-hidden
                                                                        />
                                                                    </button>
                                                                </Tooltip>
                                                            </div>
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
                            className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
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
                                {/* ?대떦??*/}
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-2">
                                        담당자{" "}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {assignableMembers.map((m) => (
                                            <button
                                                key={m}
                                                onClick={() => {
                                                    setFormProjTab("mine");
                                                    setForm({
                                                        ...form,
                                                        member: m,
                                                        proj: "",
                                                    });
                                                }}
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
                                                form.type
                                                    ? {
                                                          value: form.type,
                                                          label: form.type,
                                                      }
                                                    : null
                                            }
                                            onChange={(opt) =>
                                                setForm({
                                                    ...form,
                                                    type: opt?.value ?? "",
                                                })
                                            }
                                            placeholder="선택"
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
                                                form.priority
                                                    ? {
                                                          value: form.priority,
                                                          label: form.priority,
                                                      }
                                                    : null
                                            }
                                            onChange={(opt) =>
                                                setForm({
                                                    ...form,
                                                    priority: opt?.value ?? "",
                                                })
                                            }
                                            placeholder="선택"
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
                                </div>
                                {/* 이번주 리포트 포함 토글 */}
                                <div className="flex items-center justify-between py-1">
                                    <div>
                                        <p className="text-sm font-medium text-stone-700">
                                            이번주 리포트 포함
                                        </p>
                                        <p className="text-xs text-stone-400 mt-0.5">
                                            주간 리포트에 이 업무를 포함합니다.
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
                                 <div className="flex items-center justify-between py-1">
                                     <div>
                                         <p className="text-sm font-medium text-stone-700">
                                             중요 프로젝트
                                        </p>
                                        <p className="text-xs text-stone-400 mt-0.5">
                                            주간 브리핑 목록에서 강조 표시
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setForm((f) => ({
                                                ...f,
                                                is_starred: !f.is_starred,
                                            }))
                                        }
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${form.is_starred ? "bg-amber-500" : "bg-stone-200"}`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                        ${form.is_starred ? "translate-x-6" : "translate-x-1"}`}
                                         />
                                     </button>
                                 </div>
                                <div className="hidden items-center justify-between py-1">
                                    <div>
                                        <p className="text-sm font-medium text-stone-700">
                                            팀 캘린더에 표시
                                        </p>
                                        <p className="text-xs text-stone-400 mt-0.5">
                                            저장된 팀 캘린더에 업무 일정을 등록합니다.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={toggleTeamCalendar}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${form.show_on_team_calendar ? "bg-blue-500" : "bg-stone-200"}`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                        ${form.show_on_team_calendar ? "translate-x-6" : "translate-x-1"}`}
                                        />
                                    </button>
                                </div>
                                 {/* 프로젝트 */}
                                 <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        프로젝트{" "}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <div className="flex bg-stone-100 rounded-lg p-0.5 mb-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFormProjTab("mine")
                                            }
                                            className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all
                        ${
                            formProjTab === "mine"
                                ? "bg-white text-stone-800 shadow-sm"
                                : "text-stone-400"
                        }`}
                                        >
                                            내 프로젝트
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFormProjTab("all")
                                            }
                                            className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all
                        ${
                            formProjTab === "all"
                                ? "bg-white text-stone-800 shadow-sm"
                                : "text-stone-400"
                        }`}
                                        >
                                            전체
                                        </button>
                                    </div>
                                    <Select
                                        options={formProjOptions}
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
                                        isClearable
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
                                    value={form.content}
                                    onChange={(content) =>
                                        setForm({ ...form, content })
                                    }
                                    placeholder="예: 메인 슬라이드 리브리핑"
                                />
                                {/* 怨듭닔 */}
                                <WorkloadInput
                                    value={form.workload}
                                    onChange={(v) =>
                                        setForm({ ...form, workload: v })
                                    }
                                />
                                {/* 기간 선택 모달 */}
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

                <TaskEditModal
                    task={editTask}
                    onClose={() => setEditTask(null)}
                    onSaved={loadTasks}
                />

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

            {/* ?좎뒪??*/}
            {toast && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
                    {toast}
                </div>
            )}
        </AuthGuard>
    );
}
