"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker, DateRange } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import Select from "react-select";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/lib/types";
import type { TeamMemberOption } from "@/features/team-context/types";
import { findProjectId, findTeamMemberId, formatWorkload } from "@/lib/utils";
import { WORKLOAD_PRESETS, getMemberColors } from "@/lib/constants";
import { toLocalYmd } from "@/lib/toLocalYmd";
import Avatar from "@/components/Avatar";
import TaskContentInputs from "@/components/TaskContentInputs";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import {
    projectSearchSelectStyles,
    modalFormSelectStyles,
} from "@/lib/reactSelectStyles";
import { syncTaskToTeamCalendar } from "@/features/tasks/api/teamCalendarSync";

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

/** 추가 모달 기간 버튼 라벨 */
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
                <label className="text-xs font-medium text-stone-500">공수</label>
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

interface AddTaskModalProps {
    open: boolean;
    onClose: () => void;
    teamId: string | null;
    defaultMember: string;
    assignableMembers: string[];
    memberOptions: TeamMemberOption[];
    projects: Project[];
    onCreated: () => void;
    onToast: (msg: string) => void;
}

/** 업무 추가 모달. TasksPage.tsx 에서 분리 — 자체 폼 상태를 갖는 컴포넌트. */
export default function AddTaskModal({
    open,
    onClose,
    teamId,
    defaultMember,
    assignableMembers,
    memberOptions,
    projects,
    onCreated,
    onToast,
}: AddTaskModalProps) {
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [formDateRange, setFormDateRange] = useState<DateRange | undefined>();
    const [showFormDatePicker, setShowFormDatePicker] = useState(false);
    const [formProjTab, setFormProjTab] = useState<"mine" | "all">("mine");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 모달이 열릴 때마다 폼을 기본값으로 초기화한다.
    useEffect(() => {
        if (!open) return;
        setFormProjTab("mine");
        setForm({ ...EMPTY_FORM, member: defaultMember });
        setFormDateRange(undefined);
        setShowFormDatePicker(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

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

    const formPeriodLabel = periodButtonLabel(formDateRange);

    function toggleIsPlan() {
        setForm((f) => ({ ...f, is_plan: !f.is_plan }));
    }

    function toggleTeamCalendar() {
        if (
            !form.show_on_team_calendar &&
            !formDateRange?.from &&
            !formDateRange?.to
        ) {
            onToast("팀 캘린더에 표시하려면 시작일이나 마감일을 먼저 선택해주세요");
            return;
        }
        setForm((f) => ({
            ...f,
            show_on_team_calendar: !f.show_on_team_calendar,
        }));
    }

    async function addTask() {
        if (isSubmitting || !teamId) return;
        if (!form.member || !form.proj)
            return alert("담당자와 프로젝트명은 필수예요");
        const selectedPlayerId = findTeamMemberId(memberOptions, form.member);
        const selectedProjectId = findProjectId(projects, form.proj);
        if (selectedPlayerId === null || selectedProjectId === null) {
            onToast("현재 팀의 담당자와 프로젝트를 다시 선택해주세요");
            return;
        }
        if (!formDateRange?.from && !formDateRange?.to) {
            onToast("업무 캘린더 등록을 위해 기간 또는 마감일을 선택해주세요");
            return;
        }
        setIsSubmitting(true);
        try {
            const { data, error } = await supabase
                .from("tasks")
                .insert([
                    {
                        member: form.member,
                        player_id: selectedPlayerId,
                        type: form.type,
                        proj: form.proj,
                        project_id: selectedProjectId,
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
                        team_id: teamId,
                    },
                ])
                .select("id")
                .single();
            if (error) {
                onToast("업무 등록에 실패했어요");
                return;
            }
            if (data?.id) {
                void syncTaskToTeamCalendar(data.id).catch((err) => {
                    onToast(
                        err instanceof Error ? err.message : "팀 캘린더 동기화 실패",
                    );
                });
            }
            onClose();
            onCreated();
        } finally {
            setIsSubmitting(false);
        }
    }

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            style={{ marginBottom: `var(--nav-height)` }}
            onClick={onClose}
        >
            <div
                className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-base font-bold">업무 추가</h2>
                    <button
                        onClick={onClose}
                        aria-label="업무 추가 모달 닫기"
                        className="text-2xl text-stone-400 leading-none"
                    >
                        ×
                    </button>
                </div>
                <div className="space-y-4">
                    {/* 담당자 */}
                    <div>
                        <label className="text-xs font-medium text-stone-500 block mb-2">
                            담당자 <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {assignableMembers.map((m) => (
                                <button
                                    key={m}
                                    onClick={() => {
                                        setFormProjTab("mine");
                                        setForm({ ...form, member: m, proj: "" });
                                    }}
                                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all
                          ${form.member === m ? `${getMemberColors(m).border} ${getMemberColors(m).bg} ${getMemberColors(m).text}` : "bg-stone-50 border-stone-200 text-stone-400"}`}
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
                                ].map((t) => ({ value: t, label: t }))}
                                value={
                                    form.type
                                        ? { value: form.type, label: form.type }
                                        : null
                                }
                                onChange={(opt) =>
                                    setForm({ ...form, type: opt?.value ?? "" })
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
                            aria-label="이번주 리포트 포함"
                            aria-pressed={form.is_plan}
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
                            aria-label="중요 프로젝트"
                            aria-pressed={form.is_starred}
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
                            프로젝트 <span className="text-red-500">*</span>
                        </label>
                        <div className="flex bg-stone-100 rounded-lg p-0.5 mb-2">
                            <button
                                type="button"
                                onClick={() => setFormProjTab("mine")}
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
                                onClick={() => setFormProjTab("all")}
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
                                    ? { value: form.proj, label: form.proj }
                                    : null
                            }
                            onChange={(opt) =>
                                setForm({ ...form, proj: opt?.value ?? "" })
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
                        value={form.content}
                        onChange={(content) => setForm({ ...form, content })}
                        placeholder="예: 메인 슬라이드 리브리핑"
                    />
                    {/* 공수 */}
                    <WorkloadInput
                        value={form.workload}
                        onChange={(v) => setForm({ ...form, workload: v })}
                    />
                    {/* 기간 선택 모달 */}
                    <div className="relative z-20">
                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                            기간
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowFormDatePicker((o) => !o)}
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
                                    onClick={() => setShowFormDatePicker(false)}
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
                                                selected={formDateRange}
                                                onSelect={setFormDateRange}
                                                locale={ko}
                                                hideNavigation
                                                components={{
                                                    MonthCaption: DatePickerCaption,
                                                }}
                                            />
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setFormDateRange(undefined)
                                                }
                                                className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                            >
                                                초기화
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowFormDatePicker(false)
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
                        disabled={isSubmitting}
                        className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-60"
                    >
                        {isSubmitting ? "등록 중..." : "등록하기"}
                    </button>
                </div>
            </div>
        </div>
    );
}
