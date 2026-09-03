"use client";

import { useState } from "react";
import type { ContentItem } from "@/shared/types";
import { WORKLOAD_PRESETS } from "@/shared/constants";
import { formatWorkload } from "@/shared/utils/utils";

type TaskContentInputsProps = {
    items: ContentItem[];
    onChange: (items: ContentItem[]) => void;
    placeholder?: string;
};

const PRESET_VALUES = WORKLOAD_PRESETS.map((p) => p.value);

function WorkloadSelect({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    const [customMode, setCustomMode] = useState(
        value > 0 && !PRESET_VALUES.includes(value),
    );

    if (customMode) {
        return (
            <div className="flex items-center gap-1">
                <input
                    type="number"
                    min={0}
                    className="w-16 rounded-lg border border-stone-200 px-2 py-2 text-center text-xs"
                    placeholder="분"
                    value={value || ""}
                    onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                />
                <button
                    type="button"
                    onClick={() => {
                        setCustomMode(false);
                        if (!PRESET_VALUES.includes(value)) onChange(0);
                    }}
                    className="text-xs text-stone-400 hover:text-stone-600"
                    title="프리셋으로"
                >
                    <i className="ri-close-line" aria-hidden />
                </button>
            </div>
        );
    }

    return (
        <select
            value={PRESET_VALUES.includes(value) ? value : value > 0 ? "custom" : 0}
            onChange={(e) => {
                const v = e.target.value;
                if (v === "custom") {
                    setCustomMode(true);
                } else {
                    onChange(Number(v));
                }
            }}
            className="w-[4.5rem] rounded-lg border border-stone-200 bg-white px-1.5 py-2 text-center text-xs"
        >
            <option value={0}>-</option>
            {WORKLOAD_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                    {p.label}
                </option>
            ))}
            <option value="custom">직접</option>
        </select>
    );
}

export default function TaskContentInputs({
    items,
    onChange,
    placeholder = "업무 내용을 입력하세요",
}: TaskContentInputsProps) {
    function updateText(index: number, text: string) {
        const next = [...items];
        next[index] = { ...next[index], text };
        onChange(next);
    }

    function updateWorkload(index: number, workload: number) {
        const next = [...items];
        next[index] = { ...next[index], workload };
        onChange(next);
    }

    function addLine() {
        onChange([...items, { text: "", workload: 0 }]);
    }

    function removeLine(index: number) {
        const next = items.filter((_, i) => i !== index);
        onChange(next.length > 0 ? next : [{ text: "", workload: 0 }]);
    }

    const totalWorkload = items.reduce((sum, item) => sum + (item.workload || 0), 0);

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-stone-500">
                    업무 내용
                </label>
                <button
                    type="button"
                    onClick={addLine}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 shadow-sm hover:border-amber-300 hover:text-amber-600"
                    aria-label="업무 내용 추가"
                    title="업무 내용 추가"
                >
                    <i className="ri-add-line text-sm" />
                </button>
            </div>
            <div className="space-y-2">
                {items.map((item, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                        <input
                            className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm"
                            placeholder={index === 0 ? placeholder : "업무 내용 추가"}
                            value={item.text}
                            onChange={(e) => updateText(index, e.target.value)}
                        />
                        <WorkloadSelect
                            value={item.workload}
                            onChange={(v) => updateWorkload(index, v)}
                        />
                        <button
                            type="button"
                            onClick={() => removeLine(index)}
                            disabled={items.length === 1}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-400 shadow-sm hover:border-red-200 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label="업무 내용 삭제"
                            title="업무 내용 삭제"
                        >
                            <i className="ri-subtract-line text-sm" />
                        </button>
                    </div>
                ))}
            </div>
            {totalWorkload > 0 && (
                <p className="mt-2 text-right text-xs font-medium text-amber-600">
                    총 공수: {formatWorkload(totalWorkload)}
                </p>
            )}
        </div>
    );
}
