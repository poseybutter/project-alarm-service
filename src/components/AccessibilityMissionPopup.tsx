"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { TEAM_ID } from "@/lib/constants";
import { getDiff } from "@/lib/utils";
import type { Accessibility } from "@/lib/types";

const ACTIVE_PATHS = new Set(["/", "/home", "/tasks", "/report", "/manage", "/profile"]);
const SNOOZE_STORAGE_KEY = "accessibility-mission-snoozes";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const POST_APPLY_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const POST_RENEWAL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type AccInspectionStatus =
    | "신청필요"
    | "신청완료"
    | "취득·갱신완료"
    | "신청불필요";

type AccMissionPrompt = {
    row: Accessibility;
    kind: "apply" | "result" | "renewal" | "missing_schedule";
    nextStatus: AccInspectionStatus;
    badge: string;
    title: string;
    body: string;
    actionLabel: string;
};

function accStatusStyle(status: string) {
    if (status === "취득·갱신완료") return "bg-green-100 text-green-700";
    if (status === "신청완료") return "bg-blue-100 text-blue-700";
    if (status === "신청불필요") return "bg-stone-100 text-stone-500";
    return "bg-amber-100 text-amber-700";
}

function buildAccMissionPrompt(row: Accessibility): AccMissionPrompt | null {
    const diff = getDiff(row.end_date);
    const dueText =
        diff === null
            ? "만료일 미등록"
            : diff < 0
              ? `기한 초과 ${Math.abs(diff)}일`
              : diff === 0
                ? "D-day"
                : `D-${diff}`;

    if (row.inspection_status === "신청필요") {
        if (diff === null) {
            return {
                row,
                kind: "missing_schedule",
                nextStatus: "신청필요",
                badge: row.is_new ? "신규 퀘스트" : "만료일 미등록",
                title: "접근성 인증 일정, 잡아둘까요?",
                body: "신청필요 상태인데 인증 만료일이 비어 있어요. 일정이 정해졌다면 관리 페이지에서 만료일을 먼저 등록해두는 게 좋아요.",
                actionLabel: "관리에서 입력하기",
            };
        }

        return {
            row,
            kind: "apply",
            nextStatus: "신청완료",
            badge: dueText,
            title: "접근성 인증 신청, 진행하셨나요?",
            body:
                diff <= 0
                    ? "만료일이 지났어요. 이미 신청했다면 상태를 신청완료로 바꿔두고 다음 액션을 놓치지 않게 해요."
                    : "만료일이 가까워지고 있어요. 신청을 마쳤다면 상태를 신청완료로 바꿔두면 브리핑도 더 정확해져요.",
            actionLabel: "신청완료로 변경",
        };
    }

    if (row.inspection_status === "신청완료") {
        if (diff === null || diff > 14) return null;

        return {
            row,
            kind: "result",
            nextStatus: "취득·갱신완료",
            badge: dueText,
            title: "심사 결과가 나왔나요?",
            body: "합격 또는 갱신 완료가 확인됐다면 상태를 취득·갱신완료로 바꾸고, 취득/갱신 기준일과 다음 만료일도 함께 업데이트해주세요.",
            actionLabel: "상태/만료일 업데이트",
        };
    }

    if (row.inspection_status === "취득·갱신완료") {
        if (diff === null || diff > 45) return null;

        return {
            row,
            kind: "renewal",
            nextStatus: "신청필요",
            badge: dueText,
            title: "갱신 준비를 시작할까요?",
            body: "아직 인증 상태는 유효하지만 만료일이 가까워지고 있어요. 갱신 신청을 준비해야 한다면 상태를 신청필요로 전환해 관리 흐름을 시작하세요.",
            actionLabel: "신청필요로 전환",
        };
    }

    return null;
}

function readSnoozes() {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(SNOOZE_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object"
            ? (parsed as Record<string, number>)
            : {};
    } catch {
        return {};
    }
}

function writeSnoozes(value: Record<string, number>) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(value));
}

function missionKey(
    row: Accessibility,
    status: string,
    kind: AccMissionPrompt["kind"],
) {
    return `${row.id}:${status}:${row.end_date ?? ""}:${kind}`;
}

function notifyAccessibilityChanged() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("accessibility:changed"));
}

export default function AccessibilityMissionPopup() {
    const pathname = usePathname();
    const router = useRouter();
    const { member, role, loading } = useAuth();
    const [items, setItems] = useState<Accessibility[]>([]);
    const [snoozedUntilByKey, setSnoozedUntilByKey] =
        useState<Record<string, number>>(readSnoozes);
    const [closedState, setClosedState] = useState<{
        pathname: string;
        keys: string[];
    }>({ pathname: "", keys: [] });
    const [currentTime, setCurrentTime] = useState(0);
    const [toast, setToast] = useState("");
    const [saving, setSaving] = useState(false);

    const isActivePath = ACTIVE_PATHS.has(pathname);
    const isGuest = member === "GUEST" || role === "guest";

    const showToast = useCallback((message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2600);
    }, []);

    const loadItems = useCallback(async () => {
        if (!member || isGuest || !isActivePath) {
            setItems([]);
            return;
        }

        const { data, error } = await supabase
            .from("accessibility")
            .select("*")
            .eq("team_id", TEAM_ID)
            .eq("member", member)
            .order("end_date", { ascending: true });

        if (error) {
            console.warn("접근성 관리 미션 조회 실패:", error.message);
            return;
        }
        setItems((data ?? []) as Accessibility[]);
    }, [isActivePath, isGuest, member]);

    useEffect(() => {
        if (loading) return;
        const timer = window.setTimeout(() => {
            setCurrentTime(Date.now());
            void loadItems();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [loadItems, loading]);

    const prompt = useMemo(() => {
        if (loading || !isActivePath || isGuest) return null;

        const closedKeys =
            closedState.pathname === pathname ? closedState.keys : [];
        return (
            items
                .map(buildAccMissionPrompt)
                .filter((item): item is AccMissionPrompt => Boolean(item))
                .filter((item) => {
                    const key = missionKey(
                        item.row,
                        item.row.inspection_status,
                        item.kind,
                    );
                    return (
                        (snoozedUntilByKey[key] ?? 0) <= currentTime &&
                        !closedKeys.includes(key)
                    );
                })
                .sort((a, b) => {
                    const aDiff = getDiff(a.row.end_date) ?? -9999;
                    const bDiff = getDiff(b.row.end_date) ?? -9999;
                    return aDiff - bDiff || a.row.proj.localeCompare(b.row.proj, "ko");
                })[0] ?? null
        );
    }, [
        closedState,
        currentTime,
        isActivePath,
        isGuest,
        items,
        loading,
        pathname,
        snoozedUntilByKey,
    ]);

    const promptKey = prompt
        ? missionKey(prompt.row, prompt.row.inspection_status, prompt.kind)
        : "";

    function snoozeMissionKey(key: string, delayMs: number) {
        setSnoozedUntilByKey((prev) => {
            const next = {
                ...prev,
                [key]: Date.now() + delayMs,
            };
            writeSnoozes(next);
            return next;
        });
    }

    function snoozePrompt() {
        if (!promptKey) return;
        snoozeMissionKey(promptKey, SNOOZE_MS);
    }

    function closePrompt() {
        if (!promptKey) return;
        setClosedState((prev) => {
            const prevKeys = prev.pathname === pathname ? prev.keys : [];
            return {
                pathname,
                keys: prevKeys.includes(promptKey)
                    ? prevKeys
                    : [...prevKeys, promptKey],
            };
        });
    }

    async function applyPrompt() {
        if (!prompt) return;

        if (prompt.kind === "missing_schedule") {
            router.push(`/manage?tab=accessibility&accId=${prompt.row.id}`);
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase
                .from("accessibility")
                .update({ inspection_status: prompt.nextStatus })
                .eq("team_id", TEAM_ID)
                .eq("id", prompt.row.id);
            if (error) throw error;
            notifyAccessibilityChanged();
            if (prompt.kind === "apply") {
                snoozeMissionKey(
                    missionKey(prompt.row, "신청완료", "result"),
                    POST_APPLY_SNOOZE_MS,
                );
            }
            if (prompt.kind === "renewal") {
                snoozeMissionKey(
                    missionKey(prompt.row, "신청필요", "apply"),
                    POST_RENEWAL_SNOOZE_MS,
                );
            }
            if (prompt.kind === "result") {
                router.push(`/manage?tab=accessibility&accId=${prompt.row.id}`);
                return;
            }
            showToast(`${prompt.nextStatus} 상태로 변경했어요`);
            await loadItems();
        } catch (err) {
            showToast(
                err instanceof Error ? err.message : "상태 변경에 실패했어요",
            );
        } finally {
            setSaving(false);
        }
    }

    if (!prompt) {
        return toast ? (
            <div className="fixed bottom-24 left-1/2 z-[120] -translate-x-1/2 whitespace-nowrap rounded-full bg-stone-800 px-5 py-2.5 text-sm text-white shadow-lg">
                {toast}
            </div>
        ) : null;
    }

    return (
        <>
            <div
                className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 px-4 sm:items-center"
            >
                <div
                    className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="mb-2 flex items-center gap-2">
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700">
                                    {prompt.badge}
                                </span>
                                <span className="text-[11px] font-bold text-stone-400">
                                    접근성 관리 미션
                                </span>
                            </div>
                            <h2 className="break-words text-base font-bold text-stone-900">
                                {prompt.title}
                            </h2>
                            <p className="mt-2 break-words text-sm leading-relaxed text-stone-600">
                                {prompt.body}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={closePrompt}
                            disabled={saving}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50"
                            aria-label="닫기"
                            title="닫기"
                        >
                            <i className="ri-close-line text-xl" />
                        </button>
                    </div>

                    <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-bold text-stone-900">
                                {prompt.row.proj}
                            </p>
                            <span
                                className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${accStatusStyle(
                                    prompt.row.inspection_status,
                                )}`}
                            >
                                {prompt.row.inspection_status}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Avatar name={prompt.row.member} size={22} />
                            <span>{prompt.row.member}</span>
                            {prompt.row.end_date && (
                                <span>· 만료 {prompt.row.end_date.slice(0, 10)}</span>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-[1fr_auto] gap-2">
                        <button
                            type="button"
                            onClick={() => void applyPrompt()}
                            disabled={saving}
                            className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                        >
                            {saving ? "처리 중" : prompt.actionLabel}
                        </button>
                        <button
                            type="button"
                            onClick={snoozePrompt}
                            disabled={saving}
                            className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-500 disabled:opacity-50"
                        >
                            7일 뒤 다시 알림
                        </button>
                    </div>
                </div>
            </div>
            {toast && (
                <div className="fixed bottom-24 left-1/2 z-[120] -translate-x-1/2 whitespace-nowrap rounded-full bg-stone-800 px-5 py-2.5 text-sm text-white shadow-lg">
                    {toast}
                </div>
            )}
        </>
    );
}
