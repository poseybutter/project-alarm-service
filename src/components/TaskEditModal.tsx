"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/infrastructure/supabase/client";
import type { Task, Project, ContentItem } from "@/shared/types";
import { findProjectId, normalizeProject } from "@/shared/utils/utils";
import { getContentItems, contentItemsPayload } from "@/shared/utils/contentItems";
import { useAuth } from "@/components/AuthProvider";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import { DayPicker, DateRange } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import Select from "react-select";
import {
    projectSearchSelectStyles,
    modalFormSelectStyles,
} from "@/shared/styles/reactSelectStyles";
import { toLocalYmd } from "@/shared/utils/toLocalYmd";
import TaskContentInputs from "@/components/TaskContentInputs";

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
    contentItems: [{ text: "", workload: 0 }] as ContentItem[],
    priority: "",
    issue: "",
    status: "",
    is_plan: false,
    is_starred: false,
    show_on_team_calendar: true,
};

export type TaskEditModalProps = {
    task: Task | null;
    onClose: () => void;
    onSaved: () => void | Promise<void>;
    onDelete?: (taskId: number) => void | Promise<void>;
};

export default function TaskEditModal({
    task,
    onClose,
    onSaved,
    onDelete,
}: TaskEditModalProps) {
    const { teamId } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [editForm, setEditForm] = useState(EMPTY_EDIT);
    const [editDateRange, setEditDateRange] = useState<DateRange | undefined>();
    const [showEditDatePicker, setShowEditDatePicker] = useState(false);
    const [editProjTab, setEditProjTab] = useState<"mine" | "all">("mine");
    const [toast, setToast] = useState("");

    function showToast(message: string) {
        setToast(message);
        window.setTimeout(() => setToast(""), 2600);
    }

    useEffect(() => {
        if (!task || !teamId) return;
        setEditProjTab("mine");
        setEditForm({
            type: task.type || "",
            proj: task.proj || "",
            contentItems: getContentItems(task),
            priority: task.priority || "",
            issue: task.issue || "",
            status: task.status || "대기",
            is_plan: task.is_plan ?? false,
            is_starred: task.is_starred ?? false,
            show_on_team_calendar: task.show_on_team_calendar ?? false,
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
                .eq("team_id", teamId)
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
    }, [task?.id, teamId]);

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
        setEditForm((f) => ({ ...f, is_plan: !f.is_plan }));
    }

    function toggleTeamCalendar() {
        if (
            !editForm.show_on_team_calendar &&
            !editDateRange?.from &&
            !editDateRange?.to
        ) {
            showToast("팀 캘린더에 표시하려면 시작일이나 마감일을 먼저 선택해주세요");
            return;
        }
        setEditForm((f) => ({
            ...f,
            show_on_team_calendar: !f.show_on_team_calendar,
        }));
    }

    function handleClose() {
        setEditForm(EMPTY_EDIT);
        setEditDateRange(undefined);
        setShowEditDatePicker(false);
        onClose();
    }

    async function saveEdit() {
        if (!task) return;
        const selectedProjectId = findProjectId(projects, editForm.proj);
        if (selectedProjectId === null) {
            showToast("현재 팀의 프로젝트를 다시 선택해주세요");
            return;
        }
        if (
            !editDateRange?.from &&
            !editDateRange?.to
        ) {
            showToast("업무 캘린더 등록을 위해 기간 또는 마감일을 선택해주세요");
            return;
        }
        const ciPayload = contentItemsPayload(editForm.contentItems);
        const { error } = await supabase
            .from("tasks")
            .update({
                type: editForm.type,
                proj: editForm.proj,
                project_id: selectedProjectId,
                ...ciPayload,
                priority: editForm.priority || null,
                start_date: editDateRange?.from
                    ? toLocalYmd(editDateRange.from)
                    : null,
                end_date: editDateRange?.to
                    ? toLocalYmd(editDateRange.to)
                    : null,
                issue: editForm.issue || null,
                status: editForm.status,
                is_plan: editForm.is_plan ?? false,
                is_starred: editForm.is_starred ?? false,
                show_on_team_calendar: editForm.show_on_team_calendar ?? false,
            })
            .eq("id", task.id);
        if (error) {
            alert("업무 수정에 실패했어요");
            return;
        }
        if (!editForm.show_on_team_calendar && task.show_on_team_calendar) {
            void fetch(`/api/agents/team-calendar/tasks/${task.id}`, { method: "DELETE" }).then((res) => {
                if (!res.ok) console.warn("[team-calendar] delete failed:", res.status);
            }).catch((err) => {
                console.warn("[team-calendar] delete failed", err);
            });
        } else if (editForm.show_on_team_calendar) {
            void (async () => {
                const res = await fetch(`/api/agents/team-calendar/tasks/${task.id}`, {
                    method: "POST",
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(json.message || "팀 캘린더 동기화 실패");
                }
            })().catch((err) => {
                console.warn("[team-calendar]", err instanceof Error ? err.message : "동기화 실패");
            });
        }
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
                className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
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
                        <Select
                            options={[
                                "대기",
                                "시작 전",
                                "진행중",
                                "지연/보류",
                                "완료",
                            ].map((s) => ({ value: s, label: s }))}
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
                                ].map((ty) => ({ value: ty, label: ty }))}
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
                                options={["긴급", "높음", "보통", "낮음"].map(
                                    (p) => ({ value: p, label: p }),
                                )}
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
                            <p className="text-xs text-stone-400 mt-0.5">
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
                      ${editForm.show_on_team_calendar ? "bg-blue-500" : "bg-stone-200"}`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                        ${editForm.show_on_team_calendar ? "translate-x-6" : "translate-x-1"}`}
                            />
                        </button>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                            프로젝트{" "}
                            <span className="text-red-500">*</span>
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
                    <TaskContentInputs
                        items={editForm.contentItems}
                        onChange={(contentItems) =>
                            setEditForm({
                                ...editForm,
                                contentItems,
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
                    <div className="grid grid-cols-2 gap-2">
                        {onDelete ? (
                            <button
                                type="button"
                                onClick={() => {
                                    if (!confirm("정말 삭제할까요?")) return;
                                    void Promise.resolve(onDelete(task.id))
                                        .then(() => handleClose())
                                        .catch(() => showToast("삭제에 실패했어요"));
                                }}
                                className="rounded-xl border border-red-300 bg-white py-3.5 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                            >
                                삭제하기
                            </button>
                        ) : <span />}
                        <button
                            type="button"
                            onClick={() => void saveEdit()}
                            className="bg-stone-800 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-stone-900 transition-colors"
                        >
                            저장하기
                        </button>
                    </div>
                </div>
                {toast && (
                    <div className="fixed bottom-24 left-1/2 z-[260] -translate-x-1/2 rounded-full bg-stone-900 px-4 py-2 text-xs font-bold text-white shadow-lg">
                        {toast}
                    </div>
                )}
            </div>
        </div>
    );
}
