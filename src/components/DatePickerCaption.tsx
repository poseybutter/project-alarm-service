"use client";

import { useState } from "react";
import { useDayPicker, type MonthCaptionProps } from "react-day-picker";

/**
 * react-day-picker v9: {@link CustomComponents.MonthCaption} 대체.
 * 연·월 클릭 시 그리드 오버레이, 좌우 화살표는 useDayPicker().goToMonth 사용.
 */
export function DatePickerCaption({
    calendarMonth,
    displayIndex: _displayIndex,
    children: _children,
    ...rest
}: MonthCaptionProps) {
    const { goToMonth, previousMonth, nextMonth } = useDayPicker();
    const [showYearGrid, setShowYearGrid] = useState(false);
    const [showMonthGrid, setShowMonthGrid] = useState(false);

    const displayMonth = calendarMonth.date;
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth();

    const years = Array.from({ length: 11 }, (_, i) => 2020 + i);
    const months = [
        "1월",
        "2월",
        "3월",
        "4월",
        "5월",
        "6월",
        "7월",
        "8월",
        "9월",
        "10월",
        "11월",
        "12월",
    ];

    return (
        <div
            className="relative flex w-full items-center gap-2 py-1"
            {...rest}
        >
            <button
                type="button"
                onClick={() => {
                    if (previousMonth) goToMonth(previousMonth);
                }}
                disabled={!previousMonth}
                className="shrink-0 p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                aria-label="이전 달"
            >
                <i className="ri-arrow-left-s-line text-base" />
            </button>

            <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5">
                <button
                    type="button"
                    onClick={() => {
                        setShowYearGrid((v) => !v);
                        setShowMonthGrid(false);
                    }}
                    className="px-1 text-sm font-bold text-stone-800 hover:text-amber-600"
                >
                    {year}년
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setShowMonthGrid((v) => !v);
                        setShowYearGrid(false);
                    }}
                    className="px-1 text-sm font-bold text-stone-800 hover:text-amber-600"
                >
                    {month + 1}월
                </button>
            </div>

            <button
                type="button"
                onClick={() => {
                    if (nextMonth) goToMonth(nextMonth);
                }}
                disabled={!nextMonth}
                className="shrink-0 p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                aria-label="다음 달"
            >
                <i className="ri-arrow-right-s-line text-base" />
            </button>

            {showYearGrid ? (
                <div className="absolute left-1/2 top-8 z-10 w-56 -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
                    <div className="grid grid-cols-3 gap-1.5">
                        {years.map((y) => (
                            <button
                                key={y}
                                type="button"
                                onClick={() => {
                                    goToMonth(new Date(y, month));
                                    setShowYearGrid(false);
                                }}
                                className={`rounded-lg py-1.5 text-xs font-medium transition-all ${
                                    y === year
                                        ? "bg-amber-500 text-white"
                                        : "text-stone-600 hover:bg-amber-50 hover:text-amber-700"
                                }`}
                            >
                                {y}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {showMonthGrid ? (
                <div className="absolute left-1/2 top-8 z-10 w-56 -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
                    <div className="grid grid-cols-4 gap-1.5">
                        {months.map((m, i) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => {
                                    goToMonth(new Date(year, i));
                                    setShowMonthGrid(false);
                                }}
                                className={`rounded-lg py-1.5 text-xs font-medium transition-all ${
                                    i === month
                                        ? "bg-amber-500 text-white"
                                        : "text-stone-600 hover:bg-amber-50 hover:text-amber-700"
                                }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
