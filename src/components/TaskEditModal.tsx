"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { TASK_STATUS_OPTIONS, TASK_TYPE_OPTIONS, TASK_PRIORITY_OPTIONS } from "@/shared/constants";
import { toLocalYmd } from "@/shared/utils/toLocalYmd";
import { describeDbError } from "@/shared/utils/dbError";
import TaskContentInputs from "@/components/TaskContentInputs";
import {
    syncTaskToTeamCalendar,
    deleteTaskFromTeamCalendar,
} from "@/features/tasks/api/teamCalendarSync";
import { rpcSetTaskStatus } from "@/features/gamification/maple";

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
    const { teamId, canWrite } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    // 프로젝트 목록 조회 실패 — "프로젝트를 다시 선택" 같은 오해 문구 대신 재시도를 안내한다
    const [projectsError, setProjectsError] = useState(false);
    const [projectsReloadKey, setProjectsReloadKey] = useState(0);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState(EMPTY_EDIT);
    const [editDateRange, setEditDateRange] = useState<DateRange | undefined>();
    const [showEditDatePicker, setShowEditDatePicker] = useState(false);
    const [editProjTab, setEditProjTab] = useState<"mine" | "all">("mine");
    const [toast, setToast] = useState("");

    const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
    function showToast(message: string) {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast(message);
        toastTimerRef.current = setTimeout(() => setToast(""), 2600);
    }

    // task/팀이 바뀌면 렌더 중에 편집 폼을 재초기화한다 (effect 의 동기 setState 금지).
    // teamId 가 늦게 도착하는 경우도 비교 대상에 포함해 함께 처리한다.
    const [prevInit, setPrevInit] = useState<{
        task: Task | null;
        teamId: string | null;
    }>({ task: null, teamId: null });
    if (prevInit.task !== task || prevInit.teamId !== teamId) {
        setPrevInit({ task, teamId });
        if (task && teamId) {
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
        }
    }

    const taskId = task?.id ?? null;

    useEffect(() => {
        if (taskId === null) return;
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from("projects")
                .select("*")
                .eq("team_id", teamId)
                .order("name");
            if (cancelled) return;
            if (error) {
                setProjectsError(true);
                return;
            }
            setProjectsError(false);
            setProjects(
                (data || []).map((row) =>
                    normalizeProject(row as Record<string, unknown>),
                ),
            );
        })();
        return () => {
            cancelled = true;
        };
    }, [taskId, teamId, projectsReloadKey]);

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
        if (!task || !canWrite || saving) return;
        if (projectsError) {
            showToast("프로젝트 목록을 불러오지 못했어요. 다시 시도해주세요");
            return;
        }
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
        setSaving(true);
        let updatedRows: { id: number }[] | null = null;
        let updateError: unknown = null;
        try {
            const result = await supabase
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
                    // 하루만 선택하면 to 가 비므로 시작일을 마감일로 쓴다 (홈 수정 모달과 동일)
                    end_date: editDateRange?.to
                        ? toLocalYmd(editDateRange.to)
                        : editDateRange?.from
                          ? toLocalYmd(editDateRange.from)
                          : null,
                    issue: editForm.issue || null,
                    is_plan: editForm.is_plan ?? false,
                    is_starred: editForm.is_starred ?? false,
                    show_on_team_calendar: editForm.show_on_team_calendar ?? false,
                })
                .eq("id", task.id)
                .eq("team_id", teamId)
                .select("id");
            updatedRows = result.data;
            updateError = result.error;
        } finally {
            setSaving(false);
        }
        // RLS 로 막히면 error 없이 0행이 갱신되므로 갱신된 행 수까지 확인한다
        if (updateError) {
            alert(describeDbError("task-update", updateError, "업무 수정에 실패했어요"));
            return;
        }
        if (!updatedRows?.length) {
            alert("업무 수정에 실패했어요: 권한이 없거나 업무를 찾지 못했어요");
            return;
        }
        // 상태는 점수 반영을 위해 RPC 로만 바꾼다 (DB 가 직접 변경을 막는다)
        if (editForm.status && editForm.status !== task.status) {
            try {
                await rpcSetTaskStatus(task.id, editForm.status, task.member);
            } catch {
                alert("업무 상태 변경에 실패했어요");
            }
        }
        // 캘린더 반영 실패는 모달이 닫힌 뒤에도 보이도록 alert 로 알린다 (토스트는 모달과 함께 사라짐)
        if (!editForm.show_on_team_calendar && task.show_on_team_calendar) {
            void deleteTaskFromTeamCalendar(task.id).catch((err) => {
                alert(
                    `${err instanceof Error ? err.message : "팀 캘린더 일정 삭제 실패"}\n팀 캘린더에 일정이 남아 있을 수 있어요.`,
                );
            });
        } else if (editForm.show_on_team_calendar) {
            void syncTaskToTeamCalendar(task.id).catch((err) => {
                alert(
                    `${err instanceof Error ? err.message : "팀 캘린더 동기화 실패"}\n팀 캘린더 일정이 최신 상태가 아닐 수 있어요.`,
                );
            });
        }
        await Promise.resolve(onSaved());
        handleClose();
    }

    // 읽기 전용 사용자(viewer·게스트)에게는 수정 모달을 열지 않는다
    if (!task || !canWrite) return null;

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
                            options={TASK_STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
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
                                options={TASK_TYPE_OPTIONS.map((ty) => ({ value: ty, label: ty }))}
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
                                options={TASK_PRIORITY_OPTIONS.map(
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
                        {projectsError && (
                            <p className="mt-1.5 flex items-center gap-2 text-xs text-red-600">
                                프로젝트 목록을 불러오지 못했어요.
                                <button
                                    type="button"
                                    onClick={() =>
                                        setProjectsReloadKey((k) => k + 1)
                                    }
                                    className="font-bold underline"
                                >
                                    다시 시도
                                </button>
                            </p>
                        )}
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
                            disabled={saving}
                            className="bg-stone-800 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-stone-900 transition-colors disabled:opacity-50"
                        >
                            {saving ? "저장 중..." : "저장하기"}
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