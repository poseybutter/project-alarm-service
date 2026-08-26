"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { getDiff } from "@/shared/utils/utils";
import type { Accessibility } from "@/lib/types";

const ACTIVE_PATHS = new Set(["/", "/home", "/tasks", "/report", "/manage", "/profile"]);
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type MissionSnoozeRow = {
    snooze_key: string;
    snoozed_until: string;
};

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
            actionLabel: "신청 상태 확인하기",
        };
    }

    if (row.inspection_status === "신청완료") {
        return {
            row,
            kind: "result",
            nextStatus: "취득·갱신완료",
            badge: diff === null ? "신청 후 결과 확인" : dueText,
            title: "심사 결과가 나왔나요?",
            body: "합격 또는 갱신 완료가 확인됐다면 상태를 취득·갱신완료로 바꾸고, 취득/갱신 기준일과 다음 만료일도 함께 업데이트해주세요.",
            actionLabel: "결과 확인하기",
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
            body: "아직 인증 상태는 유효하지만 만료일이 가까워지고 있어요. 갱신 신청이 필요하다면 관리 페이지에서 상태와 만료일을 확인해주세요.",
            actionLabel: "갱신 상태 확인하기",
        };
    }

    return null;
}

function missionKey(
    row: Accessibility,
    status: string,
    kind: AccMissionPrompt["kind"],
) {
    return `${row.id}:${status}:${kind}`;
}

function legacyMissionKey(
    row: Accessibility,
    status: string,
    kind: AccMissionPrompt["kind"],
) {
    return `${row.id}:${status}:${row.end_date ?? ""}:${kind}`;
}

export default function AccessibilityMissionPopup() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, member, role, teamId, loading } = useAuth();
    const [items, setItems] = useState<Accessibility[]>([]);
    const [snoozedUntilByKey, setSnoozedUntilByKey] =
        useState<Record<string, number>>({});
    const [snoozesLoaded, setSnoozesLoaded] = useState(false);
    const [closedState, setClosedState] = useState<{
        pathname: string;
        keys: string[];
    }>({ pathname: "", keys: [] });
    const [currentTime, setCurrentTime] = useState(0);
    const [toast, setToast] = useState("");
    const [saving, setSaving] = useState(false);

    const isActivePath = ACTIVE_PATHS.has(pathname);
    const isGuest = member === "GUEST" || role === "guest";
    const userEmail = user?.email ?? "";

    const showToast = useCallback((message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2600);
    }, []);

    const loadItems = useCallback(async () => {
        if (!member || !teamId || isGuest || !isActivePath) {
            setItems([]);
            return;
        }

        const { data, error } = await supabase
            .from("accessibility")
            .select("*")
            .eq("team_id", teamId)
            .eq("member", member)
            .order("end_date", { ascending: true });

        if (error) {
            console.warn("접근성 관리 미션 조회 실패:", error.message);
            return;
        }
        setItems((data ?? []) as Accessibility[]);
    }, [isActivePath, isGuest, member, teamId]);

    const loadSnoozes = useCallback(async () => {
        if (!userEmail || !member || !teamId || isGuest || !isActivePath) {
            setSnoozedUntilByKey({});
            setSnoozesLoaded(true);
            return;
        }

        setSnoozesLoaded(false);
        const { data, error } = await supabase
            .from("agent_accessibility_mission_snoozes")
            .select("snooze_key, snoozed_until")
            .eq("team_id", teamId)
            .eq("email", userEmail)
            .gt("snoozed_until", new Date().toISOString());

        if (error) {
            console.warn("접근성 미션 다시 알림 조회 실패:", error.message);
            setSnoozedUntilByKey({});
            setSnoozesLoaded(false);
            return;
        }

        setSnoozedUntilByKey(
            Object.fromEntries(
                ((data ?? []) as MissionSnoozeRow[]).map((row) => [
                    row.snooze_key,
                    new Date(row.snoozed_until).getTime(),
                ]),
            ),
        );
        setSnoozesLoaded(true);
    }, [isActivePath, isGuest, member, teamId, userEmail]);

    useEffect(() => {
        if (loading) return;
        const timer = window.setTimeout(() => {
            setCurrentTime(Date.now());
            void loadItems();
            void loadSnoozes();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [loadItems, loadSnoozes, loading]);

    useEffect(() => {
        function handleAccessibilityChanged() {
            setCurrentTime(Date.now());
            setClosedState({ pathname: "", keys: [] });
            void loadItems();
            void loadSnoozes();
        }

        window.addEventListener(
            "accessibility:changed",
            handleAccessibilityChanged,
        );
        return () =>
            window.removeEventListener(
                "accessibility:changed",
                handleAccessibilityChanged,
            );
    }, [loadItems, loadSnoozes]);

    const prompt = useMemo(() => {
        if (loading || !snoozesLoaded || !isActivePath || isGuest) return null;

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
                    const oldKey = legacyMissionKey(
                        item.row,
                        item.row.inspection_status,
                        item.kind,
                    );
                    return (
                        (snoozedUntilByKey[key] ?? 0) <= currentTime &&
                        (snoozedUntilByKey[oldKey] ?? 0) <= currentTime &&
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
        snoozesLoaded,
        snoozedUntilByKey,
    ]);

    const promptKey = prompt
        ? missionKey(prompt.row, prompt.row.inspection_status, prompt.kind)
        : "";

    async function snoozeMissionKeys(keys: string[], delayMs: number) {
        if (!userEmail || !member || !teamId || isGuest) {
            throw new Error("다시 알림을 저장할 사용자 정보가 없어요");
        }
        const uniqueKeys = [...new Set(keys.map((key) => key.trim()))].filter(
            Boolean,
        );
        if (uniqueKeys.length === 0) {
            throw new Error("다시 알림을 저장할 대상이 없어요");
        }
        const snoozedUntil = new Date(Date.now() + delayMs);
        const { error } = await supabase
            .from("agent_accessibility_mission_snoozes")
            .upsert(
                uniqueKeys.map((key) => ({
                    team_id: teamId,
                    member,
                    email: userEmail,
                    snooze_key: key,
                    snoozed_until: snoozedUntil.toISOString(),
                    updated_at: new Date().toISOString(),
                })),
                { onConflict: "team_id,email,snooze_key" },
            );
        if (error) throw error;
        setSnoozedUntilByKey((prev) => ({
            ...prev,
            ...Object.fromEntries(
                uniqueKeys.map((key) => [key, snoozedUntil.getTime()]),
            ),
        }));
    }

    async function snoozePrompt() {
        if (!promptKey || !prompt) return;
        setSaving(true);
        try {
            await snoozeMissionKeys([promptKey], SNOOZE_MS);
        } catch (err) {
            showToast(
                err instanceof Error
                    ? err.message
                    : "다시 알림 저장에 실패했어요",
            );
        } finally {
            setSaving(false);
        }
    }

    function closePromptOnPath(nextPathname = pathname) {
        if (!promptKey) return;
        setClosedState((prev) => {
            const prevKeys = prev.pathname === nextPathname ? prev.keys : [];
            return {
                pathname: nextPathname,
                keys: prevKeys.includes(promptKey)
                    ? prevKeys
                    : [...prevKeys, promptKey],
            };
        });
    }

    function closePrompt() {
        closePromptOnPath();
    }

    function applyPrompt() {
        if (!prompt) return;
        closePromptOnPath("/manage");
        router.push("/manage?tab=accessibility");
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
                            onClick={applyPrompt}
                            disabled={saving}
                            className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                        >
                            {saving ? "처리 중" : prompt.actionLabel}
                        </button>
                        <button
                            type="button"
                            onClick={() => void snoozePrompt()}
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
