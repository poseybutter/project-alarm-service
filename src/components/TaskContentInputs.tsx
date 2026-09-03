"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DayPicker, type DateRange } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import type { ContentItem } from "@/shared/types";
import { WORKLOAD_PRESETS } from "@/shared/constants";
import { formatWorkload } from "@/shared/utils/utils";
import { toLocalYmd } from "@/shared/utils/toLocalYmd";

const STATUS_OPTIONS = ["대기", "시작 전", "진행중", "지연/보류", "완료"];
const STATUS_COLORS: Record<string, string> = {
    "대기": "bg-stone-100 text-stone-500",
    "시작 전": "bg-stone-100 text-stone-500",
    "진행중": "bg-blue-100 text-blue-700",
    "지연/보류": "bg-red-100 text-red-700",
    "완료": "bg-green-100 text-green-700",
};

type TaskContentInputsProps = {
    items: ContentItem[];
    onChange: (items: ContentItem[]) => void;
    placeholder?: string;
};

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        }
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [ref, onClose]);
}

function WorkloadTag({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [open, setOpen] = useState(false);
    const [customMode, setCustomMode] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useClickOutside(ref, () => { setOpen(false); setCustomMode(false); });

    return (
        <div className="relative inline-flex" ref={ref}>
            <button
                type="button"
                onClick={() => { setOpen(!open); setCustomMode(false); }}
                className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${value > 0 ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-400"}`}
            >
                {value > 0 ? formatWorkload(value) : "공수"}
            </button>
            {open && (
                <div className="absolute left-0 top-full z-30 mt-1 w-24 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
                    {WORKLOAD_PRESETS.map((p) => (
                        <button
                            key={p.value}
                            type="button"
                            onClick={() => { onChange(p.value); setOpen(false); }}
                            className={`block w-full px-3 py-1.5 text-left text-xs transition-colors ${value === p.value ? "bg-amber-50 font-bold text-amber-700" : "text-stone-600 hover:bg-stone-50"}`}
                        >
                            {p.label}
                        </button>
                    ))}
                    {customMode ? (
                        <div className="px-2 py-1.5">
                            <input
                                type="number"
                                min={0}
                                autoFocus
                                className="w-full rounded border border-stone-200 px-2 py-1 text-xs text-center"
                                placeholder="분"
                                value={value || ""}
                                onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                onKeyDown={(e) => { if (e.key === "Enter") { setOpen(false); setCustomMode(false); } }}
                            />
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setCustomMode(true)}
                            className="block w-full px-3 py-1.5 text-left text-xs text-stone-500 transition-colors hover:bg-stone-50"
                        >
                            직접 입력
                        </button>
                    )}
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { onChange(0); setOpen(false); setCustomMode(false); }}
                        className="block w-full border-t border-stone-100 px-3 py-1.5 text-left text-xs text-red-500 transition-colors hover:bg-red-50"
                    >
                        해제
                    </button>
                </div>
            )}
        </div>
    );
}

function StatusTag({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useClickOutside(ref, () => setOpen(false));

    return (
        <div className="relative inline-flex" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${STATUS_COLORS[value] || "bg-stone-100 text-stone-500"}`}
            >
                {value}
            </button>
            {open && (
                <div className="absolute left-0 top-full z-30 mt-1 w-24 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
                    {STATUS_OPTIONS.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => { onChange(s); setOpen(false); }}
                            className={`block w-full px-3 py-1.5 text-left text-xs transition-colors ${value === s ? "font-bold" : ""} ${STATUS_COLORS[s]?.replace("bg-", "hover:bg-") || "hover:bg-stone-50"} text-stone-700`}
                        >
                            {s}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => { onChange(""); setOpen(false); }}
                        className="block w-full border-t border-stone-100 px-3 py-1.5 text-left text-xs text-red-500 transition-colors hover:bg-red-50"
                    >
                        해제
                    </button>
                </div>
            )}
        </div>
    );
}

function parseYmd(v?: string | null): Date | undefined {
    return v ? new Date(`${v}T00:00:00`) : undefined;
}

function DateTag({ startDate, endDate, onChange }: {
    startDate?: string | null;
    endDate?: string | null;
    onChange: (s: string | null, e: string | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const hasDate = !!(startDate || endDate);
    const range: DateRange | undefined = hasDate
        ? { from: parseYmd(startDate), to: parseYmd(endDate) }
        : undefined;

    const picker = open && typeof document !== "undefined" && createPortal(
        <div
            className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
        >
            <div
                className="rounded-xl border border-stone-200 bg-white p-3 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-center">
                    <DayPicker
                        mode="range"
                        selected={range}
                        onSelect={(r) => {
                            onChange(
                                r?.from ? toLocalYmd(r.from) : null,
                                r?.to ? toLocalYmd(r.to) : null,
                            );
                        }}
                        locale={ko}
                        hideNavigation
                        components={{ MonthCaption: DatePickerCaption }}
                    />
                </div>
                <div className="mt-2 flex gap-2">
                    <button
                        type="button"
                        onClick={() => { onChange(null, null); setOpen(false); }}
                        className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                    >
                        초기화
                    </button>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-bold text-white hover:bg-amber-600"
                    >
                        적용
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );

    if (hasDate) {
        const fmt = (d: string) => d.slice(5).replace("-", "/");
        const label = startDate && endDate
            ? `${fmt(startDate)}~${fmt(endDate)}`
            : startDate
            ? `${fmt(startDate)}~`
            : `~${fmt(endDate!)}`;
        return (
            <>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="rounded-full px-2 py-0.5 text-xs font-medium bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200"
                >
                    {label}
                </button>
                {picker}
            </>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-full px-2 py-0.5 text-xs font-medium bg-stone-100 text-stone-400 hover:bg-stone-200"
            >
                + 일정
            </button>
            {picker}
        </>
    );
}

function SortableItem({
    id,
    item,
    itemCount,
    placeholder,
    onUpdateText,
    onUpdateWorkload,
    onUpdateStatus,
    onUpdateDates,
    onRemove,
}: {
    id: string;
    item: ContentItem;
    itemCount: number;
    placeholder: string;
    onUpdateText: (text: string) => void;
    onUpdateWorkload: (wl: number) => void;
    onUpdateStatus: (s: string) => void;
    onUpdateDates: (s: string | null, e: string | null) => void;
    onRemove: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
        transition: isDragging ? undefined : "transform 0ms",
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <div className="flex items-center gap-1">
                {itemCount > 1 && (
                    <button
                        type="button"
                        {...listeners}
                        {...attributes}
                        className="touch-none cursor-grab self-center px-0.5 text-stone-300 hover:text-stone-500 active:cursor-grabbing"
                        tabIndex={-1}
                        aria-label="순서 변경"
                    >
                        ⠿
                    </button>
                )}
                <input
                    className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-2 text-sm"
                    placeholder={placeholder}
                    value={item.text}
                    onChange={(e) => onUpdateText(e.target.value)}
                />
                <button
                    type="button"
                    onClick={onRemove}
                    disabled={itemCount === 1}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-400 shadow-sm hover:border-red-200 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="업무 내용 삭제"
                >
                    <i className="ri-subtract-line text-sm" />
                </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-1">
                <WorkloadTag value={item.workload} onChange={onUpdateWorkload} />
                {item.status ? (
                    <StatusTag value={item.status} onChange={onUpdateStatus} />
                ) : (
                    <button
                        type="button"
                        onClick={() => onUpdateStatus("진행중")}
                        className="rounded-full px-2 py-0.5 text-xs font-medium bg-stone-100 text-stone-400 hover:bg-stone-200"
                    >
                        + 상태
                    </button>
                )}
                <DateTag
                    startDate={item.start_date}
                    endDate={item.end_date}
                    onChange={onUpdateDates}
                />
            </div>
        </div>
    );
}

export default function TaskContentInputs({
    items,
    onChange,
    placeholder = "업무 내용을 입력하세요",
}: TaskContentInputsProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    );

    const ids = items.map((_, i) => `ci-${i}`);

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = ids.indexOf(String(active.id));
        const newIndex = ids.indexOf(String(over.id));
        onChange(arrayMove([...items], oldIndex, newIndex));
    }

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

    function updateStatus(index: number, status: string) {
        const next = [...items];
        next[index] = { ...next[index], status: status || undefined };
        onChange(next);
    }

    function updateDates(index: number, start_date: string | null, end_date: string | null) {
        const next = [...items];
        next[index] = { ...next[index], start_date, end_date };
        onChange(next);
    }

    function addLine() {
        onChange([...items, { text: "", workload: 0 }]);
    }

    function removeLine(index: number) {
        const next = items.filter((_, i) => i !== index);
        onChange(next.length > 0 ? next : [{ text: "", workload: 0 }]);
    }

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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                        {items.map((item, index) => (
                            <SortableItem
                                key={ids[index]}
                                id={ids[index]}
                                item={item}
                                itemCount={items.length}
                                placeholder={index === 0 ? placeholder : "업무 내용 추가"}
                                onUpdateText={(text) => updateText(index, text)}
                                onUpdateWorkload={(wl) => updateWorkload(index, wl)}
                                onUpdateStatus={(s) => updateStatus(index, s)}
                                onUpdateDates={(s, e) => updateDates(index, s, e)}
                                onRemove={() => removeLine(index)}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}
