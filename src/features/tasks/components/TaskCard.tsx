"use client";

import { useRef } from "react";
import Select from "react-select";
import type { Task } from "@/lib/types";
import { getDiff, formatWorkload } from "@/lib/utils";
import { TYPE_COLORS, STATUS_COLORS, normalizeStatus } from "@/lib/constants";
import { badgeSelectStyles } from "@/lib/reactSelectStyles";
import Tooltip from "@/components/Tooltip";
import TaskContentList from "@/components/TaskContentList";

const STATUS_OPTIONS = [
    "대기",
    "시작 전",
    "진행중",
    "지연/보류",
    "완료",
].map((s) => ({ value: s, label: s }));

type StatusChangeAnchor = { x: number; y: number };

/** 업무 상태를 Select 드롭다운으로 변경하는 배지 컴포넌트. 클릭 위치를 EXP 팝업 앵커로 전달한다. */
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
        anchor: StatusChangeAnchor,
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

interface TaskCardProps {
    task: Task;
    isLast: boolean;
    disabled: boolean;
    canEdit: boolean;
    onStatusChange: (
        id: number,
        status: string,
        task: Task,
        anchor: StatusChangeAnchor,
    ) => void;
    onEdit: (task: Task) => void;
    onDelete: (id: number) => void;
}

/** 업무 목록의 카드 1개. TasksPage.tsx 에서 분리 — 렌더링 전용 컴포넌트. */
export default function TaskCard({
    task: t,
    isLast,
    disabled,
    canEdit,
    onStatusChange,
    onEdit,
    onDelete,
}: TaskCardProps) {
    const diff = getDiff(t.end_date);
    const isUrgent = diff !== null && diff <= 7 && t.status !== "완료";
    const isDone = t.status === "완료";

    return (
        <div
            className={`px-4 py-3
                          ${!isLast ? "border-b border-stone-100" : ""}
                          ${isDone ? "opacity-50" : ""}
                          ${t.priority === "긴급" || normalizeStatus(t.status) === "지연/보류" ? "bg-amber-50" : ""}`}
        >
            <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        {t.is_starred && (
                            <span className="text-xs" title="중요 프로젝트">
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
                        <TaskContentList
                            content={t.content}
                            className={`mb-1 text-xs leading-relaxed ${isDone ? "text-stone-300 line-through" : "text-stone-500"}`}
                        />
                    )}
                    {t.issue && (
                        <div
                            className={`text-xs px-2 py-1 rounded-lg mb-1 border ${
                                t.priority === "긴급" ||
                                normalizeStatus(t.status) === "지연/보류"
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
                                리포트 포함
                            </span>
                        )}
                        {t.workload > 0 && <span>{formatWorkload(t.workload)}</span>}
                        {t.start_date && t.end_date && (
                            <span className={isUrgent ? "text-red-500 font-medium" : ""}>
                                {t.start_date.slice(5).replace("-", "/")} ~{" "}
                                {t.end_date.slice(5).replace("-", "/")}
                                {diff !== null &&
                                    ` D${diff < 0 ? "+" + Math.abs(diff) : "-" + diff}`}
                            </span>
                        )}
                        {!t.start_date && t.end_date && (
                            <span className={isUrgent ? "text-red-500 font-medium" : ""}>
                                ~{t.end_date.slice(5).replace("-", "/")}
                                {diff !== null &&
                                    ` D${diff < 0 ? "+" + Math.abs(diff) : "-" + diff}`}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex flex-col justify-between items-end gap-1.5 shrink-0">
                    <TaskStatusBadgeSelect
                        task={t}
                        disabled={disabled}
                        onChange={onStatusChange}
                    />
                    {canEdit && (
                        <div className="flex items-center gap-2">
                            <Tooltip label="수정">
                                <button
                                    onClick={() => onEdit(t)}
                                    aria-label="수정"
                                    className="text-base text-stone-300 hover:text-amber-500 transition-colors"
                                >
                                    <i className="ri-edit-line" aria-hidden />
                                </button>
                            </Tooltip>
                            <Tooltip label="삭제">
                                <button
                                    onClick={() => onDelete(t.id)}
                                    aria-label="삭제"
                                    className="text-base text-stone-300 hover:text-red-400 transition-colors"
                                >
                                    <i className="ri-delete-bin-line" aria-hidden />
                                </button>
                            </Tooltip>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
