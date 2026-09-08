"use client";

import { useCallback, useEffect, useState } from "react";
import type { HistoryItem } from "./useProjectFields";

type Props = {
    projectId: number;
    projectName: string;
    loadHistory: (
        projectId: number,
        cursor?: number | null,
    ) => Promise<{ items: HistoryItem[]; nextCursor: number | null }>;
    onClose: () => void;
};

/** 같은 사용자·같은 시각(60초 이내) 변경을 하나의 그룹으로 묶는다 */
function groupHistory(items: HistoryItem[]) {
    const groups: { key: string; changedBy: string; changedAt: string; items: HistoryItem[] }[] = [];

    for (const item of items) {
        const lastGroup = groups[groups.length - 1];
        if (
            lastGroup &&
            lastGroup.changedBy === item.changed_by &&
            Math.abs(
                new Date(lastGroup.changedAt).getTime() -
                    new Date(item.changed_at).getTime(),
            ) < 60_000
        ) {
            lastGroup.items.push(item);
        } else {
            groups.push({
                key: `${item.id}`,
                changedBy: item.changed_by,
                changedAt: item.changed_at,
                items: [item],
            });
        }
    }
    return groups;
}

function formatDate(dateStr: string) {
    const TZ = "Asia/Seoul";
    const date = new Date(dateStr);
    const now = new Date();

    // KST 기준 날짜 문자열로 비교 (브라우저 로컬 시간대에 의존하지 않음)
    const dateKST = date.toLocaleDateString("sv-SE", { timeZone: TZ }); // "YYYY-MM-DD"
    const todayKST = now.toLocaleDateString("sv-SE", { timeZone: TZ });
    const yesterday = new Date(now.getTime() - 86_400_000);
    const yesterdayKST = yesterday.toLocaleDateString("sv-SE", { timeZone: TZ });

    if (dateKST === todayKST) return "오늘";
    if (dateKST === yesterdayKST) return "어제";

    return new Intl.DateTimeFormat("ko-KR", {
        timeZone: TZ,
        month: "long",
        day: "numeric",
    }).format(date);
}

function formatTime(dateStr: string) {
    return new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date(dateStr));
}

function extractName(email: string) {
    const local = email.split("@")[0];
    return local.replace(/[._-]/g, " ");
}

function actionLabel(action: string) {
    if (action === "create") return "등록";
    if (action === "delete") return "삭제";
    return "변경";
}

export default function FieldHistoryPanel({
    projectId,
    projectName,
    loadHistory,
    onClose,
}: Props) {
    const [items, setItems] = useState<HistoryItem[]>([]);
    const [nextCursor, setNextCursor] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(
        async (cursor?: number | null) => {
            setLoading(true);
            try {
                const result = await loadHistory(projectId, cursor);
                if (cursor) {
                    setItems((prev) => [...prev, ...result.items]);
                } else {
                    setItems(result.items);
                }
                setNextCursor(result.nextCursor);
            } finally {
                setLoading(false);
            }
        },
        [projectId, loadHistory],
    );

    useEffect(() => {
        void load();
    }, [load]);

    const groups = groupHistory(items);

    // 날짜별로 그룹을 분류
    const dateGroups: { date: string; groups: typeof groups }[] = [];
    for (const group of groups) {
        const dateLabel = formatDate(group.changedAt);
        const lastDateGroup = dateGroups[dateGroups.length - 1];
        if (lastDateGroup && lastDateGroup.date === dateLabel) {
            lastDateGroup.groups.push(group);
        } else {
            dateGroups.push({ date: dateLabel, groups: [group] });
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            style={{ marginBottom: "var(--nav-height)" }}
            onClick={onClose}
        >
            <div
                className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-5">
                    <div>
                        <h2 className="text-base font-bold">업데이트 이력</h2>
                        <p className="text-xs text-stone-400 mt-0.5">
                            {projectName}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-2xl text-stone-400 leading-none"
                        aria-label="닫기"
                    >
                        ×
                    </button>
                </div>

                {loading && items.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-xs text-stone-400">불러오는 중...</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-xs text-stone-400">업데이트 이력이 없습니다</p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {dateGroups.map((dg) => (
                            <div key={dg.date}>
                                <p className="text-xs font-medium text-stone-500 mb-2">
                                    {dg.date}
                                </p>
                                <div className="space-y-2">
                                    {dg.groups.map((group) => (
                                        <div
                                            key={group.key}
                                            className="rounded-lg border border-stone-200 p-3"
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-xs font-medium text-stone-700">
                                                    {extractName(group.changedBy)}
                                                </span>
                                                <span className="text-[10px] text-stone-400">
                                                    {formatTime(group.changedAt)}
                                                </span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {group.items.map((item) => (
                                                    <div key={item.id}>
                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                            <span className="text-xs text-stone-500 font-medium">
                                                                {item.field_label}
                                                            </span>
                                                            {item.is_secret && (
                                                                <span className="text-[10px] bg-amber-100 text-amber-600 rounded px-1 py-px">
                                                                    secret
                                                                </span>
                                                            )}
                                                        </div>
                                                        {item.is_secret ? (
                                                            <p className="text-[11px] text-stone-400 italic">
                                                                비밀번호가{" "}
                                                                {actionLabel(
                                                                    item.action,
                                                                )}
                                                                되었습니다
                                                            </p>
                                                        ) : item.action ===
                                                          "create" ? (
                                                            <div className="text-xs font-mono">
                                                                <span className="text-green-600 bg-green-50 rounded px-1">
                                                                    + {item.new_value}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs font-mono space-y-0.5">
                                                                {item.old_value && (
                                                                    <div className="text-red-500 bg-red-50 rounded px-1 py-px">
                                                                        −{" "}
                                                                        {item.old_value}
                                                                    </div>
                                                                )}
                                                                {item.new_value && (
                                                                    <div className="text-green-600 bg-green-50 rounded px-1 py-px">
                                                                        +{" "}
                                                                        {item.new_value}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {nextCursor && (
                    <button
                        type="button"
                        onClick={() => void load(nextCursor)}
                        disabled={loading}
                        className="w-full mt-4 py-2.5 text-xs font-medium text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-50"
                    >
                        {loading ? "불러오는 중..." : "더 보기"}
                    </button>
                )}
            </div>
        </div>
    );
}
