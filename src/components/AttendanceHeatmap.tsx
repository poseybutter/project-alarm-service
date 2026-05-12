"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toLocalYmd } from "@/lib/toLocalYmd";

type AttendanceHeatmapProps = {
    member: string;
};

const MONTH_SHORT = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
] as const;

function parseYmdUTC(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function utcMondayOfContainingWeek(iso: string): Date {
    const dt = parseYmdUTC(iso);
    const dow = dt.getUTCDay();
    const delta = dow === 0 ? -6 : 1 - dow;
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt;
}

function monthLabelUTC(iso: string): string {
    return MONTH_SHORT[parseYmdUTC(iso).getUTCMonth()] ?? "";
}

function buildWeekGrid(today: string): {
    grid: string[][];
    monthLabels: (string | null)[];
} {
    const anchorMonday = utcMondayOfContainingWeek(today);
    const grid: string[][] = [];
    for (let r = 0; r < 5; r++) {
        grid[r] = [];
        for (let c = 0; c < 16; c++) {
            const d = new Date(anchorMonday);
            d.setUTCDate(anchorMonday.getUTCDate() + (c - 15) * 7 + r);
            grid[r][c] = toLocalYmd(d);
        }
    }
    const monthLabels: (string | null)[] = [];
    let prevMonth: number | null = null;
    for (let c = 0; c < 16; c++) {
        const d = parseYmdUTC(grid[0][c]);
        const m = d.getUTCMonth();
        if (c === 0 || m !== prevMonth) {
            monthLabels[c] = monthLabelUTC(grid[0][c]);
            prevMonth = m;
        } else {
            monthLabels[c] = null;
        }
    }
    return { grid, monthLabels };
}

function activityCellClass(n: number): string {
    if (n === 0) return "bg-stone-100";
    if (n <= 2) return "bg-green-200";
    if (n <= 5) return "bg-green-400";
    return "bg-green-600";
}

/** GitHub-style title (UTC date) */
function tooltipLabel(iso: string, count: number): string {
    const d = parseYmdUTC(iso);
    const mon = MONTH_SHORT[d.getUTCMonth()];
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    if (count === 0) {
        return `No contributions on ${mon} ${day}, ${year}.`;
    }
    return `${count} contribution${count === 1 ? "" : "s"} on ${mon} ${day}, ${year}.`;
}

const ROW_LABELS = ["Mon", "", "Wed", "", "Fri"] as const;

/** GitHub contribution cell: ~10–11px, 1:1 */
const SQ = "size-[10px] shrink-0 rounded-[2px] sm:size-3 sm:rounded-sm";

/** Legend gradient steps (visual only; mirrors GitHub “Less → More”) */
const LEGEND_SWATCHES = [
    "bg-stone-100 ring-1 ring-neutral-200/80",
    "bg-green-200",
    "bg-green-300",
    "bg-green-500",
    "bg-green-700",
] as const;

export default function AttendanceHeatmap({ member }: AttendanceHeatmapProps) {
    const today = useMemo(
        () => toLocalYmd(new Date()),
        [],
    );
    const { grid, monthLabels } = useMemo(
        () => buildWeekGrid(today),
        [today],
    );

    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        if (!member) {
            setCounts({});
            setLoading(false);
            return;
        }

        setLoading(true);
        const min = grid[0][0];
        const max = grid[4][15];
        const { data, error } = await supabase
            .from("attendance")
            .select("date, activity_count")
            .eq("member", member)
            .gte("date", min)
            .lte("date", max);

        if (error) {
            setCounts({});
        } else {
            const next: Record<string, number> = {};
            for (const row of data ?? []) {
                const iso = row.date as string;
                next[iso] = Number(row.activity_count ?? 0);
            }
            setCounts(next);
        }
        setLoading(false);
    }, [member, grid]);

    useEffect(() => {
        if (!member) {
            setCounts({});
            setLoading(false);
            return;
        }

        void loadData();

        const channel = supabase
            .channel(`attendance-heatmap-${member}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "attendance",
                    filter: `member=eq.${member}`,
                },
                () => {
                    void loadData();
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel).catch(console.error);
        };
    }, [member, loadData]);

    if (!member) return null;

    return (
        <div className="w-full min-w-0">
            <div className="flex w-full justify-center overflow-x-auto pb-1">
                <div className="inline-flex max-w-full gap-[3px]">
                    {/* Weekday labels — GitHub: Mon / Wed / Fri style */}
                    <div className="flex shrink-0 flex-col gap-[3px] pr-0.5">
                        <div
                            className="flex h-[15px] shrink-0 items-end justify-end sm:h-[17px]"
                            aria-hidden
                        />
                        {ROW_LABELS.map((label, r) => (
                            <div
                                key={r}
                                className="flex h-[10px] w-[22px] shrink-0 items-center justify-end text-[10px] leading-none text-neutral-500 sm:h-3 sm:w-[26px] sm:text-[11px]"
                            >
                                {label}
                            </div>
                        ))}
                    </div>

                    {Array.from({ length: 16 }, (_, c) => (
                        <div
                            key={c}
                            className="flex shrink-0 flex-col gap-[3px]"
                        >
                            <div className="flex h-[15px] shrink-0 items-end justify-center pb-px sm:h-[17px]">
                                {monthLabels[c] ? (
                                    <span className="whitespace-nowrap text-[10px] font-normal leading-none text-neutral-500 sm:text-[11px]">
                                        {monthLabels[c]}
                                    </span>
                                ) : null}
                            </div>
                            {[0, 1, 2, 3, 4].map((r) => {
                                const date = grid[r][c];
                                const n = counts[date] ?? 0;
                                const isToday = date === today;
                                const base = activityCellClass(n);
                                const ring = isToday
                                    ? " ring-1 ring-green-600 ring-offset-[1px] ring-offset-white"
                                    : "";
                                const fade = loading ? " opacity-40" : "";
                                return (
                                    <div
                                        key={date}
                                        title={tooltipLabel(date, n)}
                                        className={`${SQ} ${base}${ring}${fade}`}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* GitHub-style legend: Less … More */}
            <div className="mt-2 flex w-full justify-end">
                <div className="flex items-center gap-1.5 text-[10px] text-neutral-600 sm:text-xs">
                    <span>Less</span>
                    <div className="flex gap-[3px]">
                        {LEGEND_SWATCHES.map((sw) => (
                            <span
                                key={sw}
                                className={`size-[10px] shrink-0 rounded-[2px] sm:size-3 sm:rounded-sm ${sw}`}
                            />
                        ))}
                    </div>
                    <span>More</span>
                </div>
            </div>
        </div>
    );
}
