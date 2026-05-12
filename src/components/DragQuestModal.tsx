"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import type { Task } from "@/lib/types";
import { TYPE_COLORS } from "@/lib/constants";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import { toLocalYmd } from "@/lib/toLocalYmd";

type DragQuestModalProps = {
    task: Task;
    onClose: () => void;
    onSubmit: (content: string, endDate: string) => void | Promise<void>;
};

export default function DragQuestModal({
    task,
    onClose,
    onSubmit,
}: DragQuestModalProps) {
    const [content, setContent] = useState("");
    const [endDate, setEndDate] = useState("");
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const selectedDate = endDate ? new Date(`${endDate}T00:00:00`) : undefined;
    const dateLabel = selectedDate
        ? `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}`
        : "마감일 선택";

    async function handleConfirm() {
        const trimmed = content.trim();
        if (!trimmed) {
            alert("내용을 입력해 주세요");
            return;
        }
        setSubmitting(true);
        try {
            await onSubmit(trimmed, endDate);
            onClose();
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl rounded-t-2xl bg-white p-5"
                style={{ marginBottom: "67px" }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-base font-bold">오늘 할 작업 입력</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-2xl leading-none text-stone-400"
                    >
                        ×
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <p className="mb-1.5 block text-xs font-medium text-stone-500">
                            업무
                        </p>
                        <div className="flex items-center gap-2">
                            {task.type && (
                                <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[task.type] || "bg-gray-100 text-gray-600"}`}
                                >
                                    {task.type}
                                </span>
                            )}
                            <span className="text-sm font-medium text-stone-700">
                                {task.proj}
                            </span>
                        </div>
                        {task.content && (
                            <p className="mt-1 text-xs text-stone-400">
                                {task.content}
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-stone-500">
                            내용 <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            className="h-24 w-full resize-none rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                            placeholder="오늘 할 작업을 적어 주세요"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-stone-500">
                            마감일 (선택)
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowDatePicker((p) => !p)}
                            className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-all
                            ${showDatePicker ? "border-amber-300 ring-2 ring-amber-200" : "border-stone-200 hover:border-stone-300"}`}
                        >
                            <span
                                className={
                                    selectedDate
                                        ? "text-stone-800"
                                        : "text-stone-400"
                                }
                            >
                                {dateLabel}
                            </span>
                        </button>
                        {showDatePicker &&
                            typeof document !== "undefined" &&
                            createPortal(
                                <div
                                    className="fixed inset-0 z-[200] bg-black/30"
                                    onClick={() => setShowDatePicker(false)}
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
                                                mode="single"
                                                selected={selectedDate}
                                                onSelect={(d) => {
                                                    setEndDate(
                                                        d ? toLocalYmd(d) : "",
                                                    );
                                                }}
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
                                                onClick={() => setEndDate("")}
                                                className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                            >
                                                초기화
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowDatePicker(false)
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
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleConfirm()}
                        className="w-full rounded-xl bg-amber-500 py-3.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    );
}
