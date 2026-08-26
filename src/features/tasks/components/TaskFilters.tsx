"use client";

import Select from "react-select";
import { taskFilterProjectSelectStyles } from "@/shared/styles/reactSelectStyles";

const PRIORITY_OPTIONS = ["긴급", "높음", "보통", "낮음"].map((p) => ({
    value: p,
    label: p,
}));

interface TaskFiltersProps {
    members: string[];
    projectOptions: { value: string; label: string }[];
    filterMember: string;
    filterProject: string;
    filterPriority: string;
    onMemberChange: (value: string) => void;
    onProjectChange: (value: string) => void;
    onPriorityChange: (value: string) => void;
}

/** 담당자·프로젝트·우선순위 필터. TasksPage.tsx 에서 분리 — 렌더링 전용 컴포넌트. */
export default function TaskFilters({
    members,
    projectOptions,
    filterMember,
    filterProject,
    filterPriority,
    onMemberChange,
    onProjectChange,
    onPriorityChange,
}: TaskFiltersProps) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 px-4 py-3">
            <div className="min-w-0">
                <Select
                    options={members.map((m) => ({ value: m, label: m }))}
                    value={
                        filterMember
                            ? { value: filterMember, label: filterMember }
                            : null
                    }
                    onChange={(opt) => onMemberChange(opt?.value ?? "")}
                    placeholder="전체 담당자"
                    isClearable
                    isSearchable={false}
                    styles={taskFilterProjectSelectStyles}
                    menuPortalTarget={
                        typeof document !== "undefined" ? document.body : null
                    }
                />
            </div>
            <div className="min-w-0">
                <Select
                    options={projectOptions}
                    value={
                        filterProject
                            ? { value: filterProject, label: filterProject }
                            : null
                    }
                    onChange={(opt) => onProjectChange(opt?.value ?? "")}
                    placeholder="전체 프로젝트"
                    isClearable
                    isSearchable
                    styles={taskFilterProjectSelectStyles}
                    menuPortalTarget={
                        typeof document !== "undefined" ? document.body : null
                    }
                    noOptionsMessage={() => "프로젝트가 없어요"}
                />
            </div>
            <div className="min-w-0">
                <Select
                    options={PRIORITY_OPTIONS}
                    value={
                        filterPriority
                            ? { value: filterPriority, label: filterPriority }
                            : null
                    }
                    onChange={(opt) => onPriorityChange(opt?.value ?? "")}
                    placeholder="전체 우선순위"
                    isClearable
                    isSearchable={false}
                    styles={taskFilterProjectSelectStyles}
                    menuPortalTarget={
                        typeof document !== "undefined" ? document.body : null
                    }
                />
            </div>
        </div>
    );
}
