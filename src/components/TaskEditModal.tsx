"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import type { Task, Project } from "@/lib/types";
import { formatWorkload, normalizeProject } from "@/lib/utils";
import { WORKLOAD_PRESETS } from "@/lib/constants";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import { DayPicker, DateRange } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import Select from "react-select";
import { projectSearchSelectStyles } from "@/lib/reactSelectStyles";
import { toLocalYmd } from "@/lib/toLocalYmd";

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
                onChange={(e) =>
                    onChange(parseInt(e.target.value, 10) || 0)
                }
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

export type TaskEditModalProps = {
    task: Task | null;
    onClose: () => void;
    onSaved: () => void | Promise<void>;
};

export default function TaskEditModal({
    task,
    onClose,
    onSaved,
}: TaskEditModalProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [editForm, setEditForm] = useState(EMPTY_EDIT);
    const [editDateRange, setEditDateRange] = useState<DateRange | undefined>();
    const [showEditDatePicker, setShowEditDatePicker] = useState(false);
    const [editProjTab, setEditProjTab] = useState<"mine" | "all">("mine");

    useEffect(() => {
        if (!task) return;
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
        if (task.start_date || task.end_date) {
            setEditDateRange({
                from: parseYmdToLocalDate(task.start_date),
                to: parseYmdToLocalDate(task.end_date),
            });
        } else {
            setEditDateRange(undefined);
        }
        setShowEditDatePicker(false);
    }, [task]);

    useEffect(() => {
        if (!task) return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from("projects")
                .select("*")
                .order("name");
            if (cancelled) return;
            setProjects(
                (data || []).map((row) =>
                    normalizeProject(row as Record<string, unknown>),
                ),
            );
        })();
        return () => {
            cancelled = true;
        };
    }, [task?.id]);

    const editMember = task?.member ?? "";

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

    const editPeriodLabel = periodButtonLabel(editDateRange);

    function toggleEditIsPlan() {
        const newVal = !editForm.is_plan;
        if (newVal) {
            const range = getNextWeekRange();
            setEditDateRange({ from: range.from, to: range.to });
        }
        setEditForm((f) => ({ ...f, is_plan: newVal }));
    }

    function handleClose() {
        setEditForm(EMPTY_EDIT);
        setEditDateRange(undefined);
        setShowEditDatePicker(false);
        onClose();
    }

    async function saveEdit() {
        if (!task) return;
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
                    : null,
                workload: editForm.workload || 0,
                issue: editForm.issue || null,
                status: editForm.status,
                is_plan: editForm.is_plan ?? false,
            })
            .eq("id", task.id);
        await Promise.resolve(onSaved());
        handleClose();
    }

    if (!task) return null;

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            style={{ marginBottom: `var(--nav-height)` }}
            onClick={handleClose}
        >
            <div
                className="bg-white rounded-t-2xl p-5 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-base font-bold">업무 수정</h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="text-2xl text-stone-400 leading-none"
                    >
                        ×
                    </button>
                </div>
                <div className="space-y-4">
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
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </select>
                            <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                        </div>
                    </div>
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
                                    ].map((ty) => (
                                        <option key={ty} value={ty}>
                                            {ty}
                                        </option>
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
                                            priority: e.target.value,
                                        })
                                    }
                                >
                                    <option value="">선택</option>
                                    {["긴급", "높음", "보통", "낮음"].map(
                                        (p) => (
                                            <option key={p} value={p}>
                                                {p}
                                            </option>
                                        ),
                                    )}
                                </select>
                                <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                            </div>
                        </div>
                    </div>
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
                    <div>
                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                            프로젝트
                        </label>
                        <div className="flex bg-stone-100 rounded-lg p-0.5 mb-2">
                            <button
                                type="button"
                                onClick={() => setEditProjTab("mine")}
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
                                onClick={() => setEditProjTab("all")}
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
                    <WorkloadInput
                        value={editForm.workload}
                        onChange={(v) =>
                            setEditForm({
                                ...editForm,
                                workload: v,
                            })
                        }
                    />
                    <div className="relative z-20">
                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                            기간
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowEditDatePicker((o) => !o)}
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
                                    onClick={() => setShowEditDatePicker(false)}
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
                                                mode="range"
                                                selected={editDateRange}
                                                onSelect={setEditDateRange}
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
                                                    setEditDateRange(undefined)
                                                }
                                                className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                            >
                                                초기화
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowEditDatePicker(false)
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
                        type="button"
                        onClick={() => void saveEdit()}
                        className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm"
                    >
                        저장하기
                    </button>
                </div>
            </div>
        </div>
    );
}
