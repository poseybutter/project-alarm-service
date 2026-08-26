"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import NotificationButton from "@/components/NotificationButton";
import UserMenu from "@/components/UserMenu";
import TeamSwitcher from "@/components/TeamSwitcher";
import AgentButton from "@/components/AgentButton";
import { useAuth } from "@/components/AuthProvider";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import type {
    AgentSuggestion,
    GoogleChatCardPayload,
    NotificationSuggestionPayload,
} from "@/lib/agents/types";

type MemberWebhook = {
    member: string;
    email: string;
    role: string | null;
    configured: boolean;
    updatedAt: string | null;
};

type CalendarStatus = {
    connected: boolean;
    connection: {
        email: string;
        google_email: string | null;
        updated_at: string;
    } | null;
};

type NotificationSettings = {
    morning_send_time: string;
    morning_enabled: boolean;
};

type TeamCalendarSettings = {
    calendar_id: string;
    connection_email: string;
    updated_at: string;
};

type MemberCalendarSettings = {
    member: string;
    calendar_id: string;
    updated_at: string;
};

type EditingBriefingItem = {
    suggestionId: number;
    sectionIndex: number;
    widgetIndex: number;
    text: string;
};

function getPayload(suggestion: AgentSuggestion) {
    return suggestion.payload as Partial<NotificationSuggestionPayload>;
}

function getPayloadCard(suggestion: AgentSuggestion) {
    return getPayload(suggestion).card as GoogleChatCardPayload | undefined;
}

function getPayloadText(suggestion: AgentSuggestion) {
    const text = getPayload(suggestion).text;
    return typeof text === "string" ? text : "";
}

function formatDateTime(value: string | null) {
    if (!value) return "";
    return new Date(value).toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function cardHtmlToPlainText(value: string) {
    return value
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
}

export default function AgentsPage() {
    const { role, member, members, teamId } = useAuth();
    const isAdmin = role === "admin";
    const teamEventMembers = useMemo(
        () => members.filter((name) => name && name !== "GUEST"),
        [members],
    );

    const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(true);
    const [workingId, setWorkingId] = useState<number | null>(null);
    const [generating, setGenerating] = useState(false);

    const [calendarStatus, setCalendarStatus] =
        useState<CalendarStatus | null>(null);
    const [calendarLoading, setCalendarLoading] = useState(true);
    const [calendarSyncing, setCalendarSyncing] = useState(false);
    const [settings, setSettings] = useState<NotificationSettings>({
        morning_send_time: "08:30:00",
        morning_enabled: true,
    });
    const [teamCalendar, setTeamCalendar] =
        useState<TeamCalendarSettings | null>(null);
    const [teamCalendarId, setTeamCalendarId] = useState("");
    const [memberCalendarIds, setMemberCalendarIds] = useState<
        Record<string, string>
    >({});
    const [teamCalendarSaving, setTeamCalendarSaving] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [testSending, setTestSending] = useState(false);

    const [webhookModalOpen, setWebhookModalOpen] = useState(false);
    const [editingBriefingItem, setEditingBriefingItem] =
        useState<EditingBriefingItem | null>(null);
    const [briefingEditSaving, setBriefingEditSaving] = useState(false);
    const [webhookUrl, setWebhookUrl] = useState("");
    const [webhookConfigured, setWebhookConfigured] = useState(false);
    const [webhookLoading, setWebhookLoading] = useState(true);
    const [webhookSaving, setWebhookSaving] = useState(false);
    const [memberWebhooks, setMemberWebhooks] = useState<MemberWebhook[]>([]);
    const [memberWebhookDrafts, setMemberWebhookDrafts] = useState<
        Record<string, string>
    >({});
    const [savingMemberWebhook, setSavingMemberWebhook] = useState<string | null>(
        null,
    );

    const [toast, setToast] = useState("");

    const showToast = useCallback((message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2600);
    }, []);

    const loadSuggestions = useCallback(async () => {
        setSuggestionsLoading(true);
        try {
            const params = new URLSearchParams({
                status: "pending",
                agentType: "notification",
                limit: "100",
            });
            const res = await fetch(`/api/agents/suggestions?${params}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "브리핑 후보 조회 실패");
            setSuggestions(json.suggestions ?? []);
        } catch (err) {
            showToast(
                err instanceof Error ? err.message : "브리핑 후보 조회 실패",
            );
        } finally {
            setSuggestionsLoading(false);
        }
    }, [showToast]);

    const loadCalendarStatus = useCallback(async () => {
        setCalendarLoading(true);
        try {
            const res = await fetch("/api/agents/calendar/status");
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "캘린더 상태 조회 실패");
            setCalendarStatus(json);
        } catch (err) {
            showToast(
                err instanceof Error ? err.message : "캘린더 상태 조회 실패",
            );
        } finally {
            setCalendarLoading(false);
        }
    }, [showToast]);

    const loadWebhook = useCallback(async () => {
        setWebhookLoading(true);
        try {
            const res = await fetch("/api/agents/webhook");
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "Webhook 조회 실패");

            setWebhookUrl(json.webhookUrl ?? "");
            setWebhookConfigured(Boolean(json.configured));

            const members = (json.members ?? []) as MemberWebhook[];
            setMemberWebhooks(members);
            setMemberWebhookDrafts(
                Object.fromEntries(members.map((row) => [row.member, ""])),
            );
        } catch (err) {
            showToast(err instanceof Error ? err.message : "Webhook 조회 실패");
        } finally {
            setWebhookLoading(false);
        }
    }, [showToast]);

    const loadSettings = useCallback(async () => {
        setSettingsLoading(true);
        try {
            const res = await fetch("/api/agents/settings");
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "알림 설정 조회 실패");
            setSettings(json.settings);
            setTeamCalendar(json.teamCalendar ?? null);
            setTeamCalendarId(json.teamCalendar?.calendar_id ?? "");
            const memberCalendars =
                (json.memberCalendars ?? []) as MemberCalendarSettings[];
            setMemberCalendarIds(
                Object.fromEntries(
                    teamEventMembers.map((name) => [
                        name,
                        memberCalendars.find((row) => row.member === name)
                            ?.calendar_id ?? "",
                    ]),
                ),
            );
        } catch (err) {
            showToast(err instanceof Error ? err.message : "알림 설정 조회 실패");
        } finally {
            setSettingsLoading(false);
        }
    }, [showToast, teamEventMembers]);

    const refreshMyBriefing = useCallback(async () => {
        const res = await fetch("/api/agents/notifications/me", {
            method: "POST",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "브리핑 갱신 실패");
        await loadSuggestions();
        return json.suggestions?.length ?? 0;
    }, [loadSuggestions]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadSuggestions();
            void loadCalendarStatus();
            void loadWebhook();
            void loadSettings();

            const params = new URLSearchParams(window.location.search);
            if (params.get("calendar") === "connected") {
                showToast("Google Calendar가 연결되었습니다");
                window.history.replaceState({}, "", "/agents");
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [loadCalendarStatus, loadSettings, loadSuggestions, loadWebhook, showToast, teamId]);

    async function saveTeamCalendarSettings() {
        setTeamCalendarSaving(true);
        try {
            const res = await fetch("/api/agents/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    morningSendTime: settings.morning_send_time.slice(0, 5),
                    morningEnabled: true,
                    teamCalendarId,
                    memberCalendarIds,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "팀 캘린더 설정 저장 실패");
            setSettings(json.settings);
            setTeamCalendar(json.teamCalendar ?? null);
            setTeamCalendarId(json.teamCalendar?.calendar_id ?? teamCalendarId);
            const savedMemberCalendars =
                (json.memberCalendars ?? []) as MemberCalendarSettings[];
            setMemberCalendarIds(
                Object.fromEntries(
                    teamEventMembers.map((name) => [
                        name,
                        savedMemberCalendars.find((row) => row.member === name)
                            ?.calendar_id ?? memberCalendarIds[name] ?? "",
                    ]),
                ),
            );
            if (!calendarStatus?.connected) {
                showToast("팀 캘린더 설정을 저장했습니다");
                return;
            }

            try {
                const resyncRes = await fetch(
                    "/api/agents/team-calendar/tasks/resync",
                    { method: "POST" },
                );
                const resyncJson = await resyncRes.json();
                if (!resyncRes.ok) {
                    throw new Error(
                        resyncJson.message || "기존 업무 캘린더 재동기화 실패",
                    );
                }
                showToast(
                    `팀 캘린더 설정 저장, 기존 업무 ${resyncJson.synced ?? 0}건 재동기화`,
                );
            } catch (resyncErr) {
                showToast(
                    resyncErr instanceof Error
                        ? `설정은 저장됨 · ${resyncErr.message}`
                        : "설정은 저장됐지만 기존 업무 재동기화에 실패했습니다",
                );
            }
        } catch (err) {
            showToast(
                err instanceof Error ? err.message : "팀 캘린더 설정 저장 실패",
            );
        } finally {
            setTeamCalendarSaving(false);
        }
    }

    async function syncCalendar() {
        setCalendarSyncing(true);
        try {
            const res = await fetch("/api/agents/calendar/sync", {
                method: "POST",
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "캘린더 동기화 실패");
            showToast(
                `오늘 일정 ${json.count ?? 0}개 동기화, 후보 ${
                    json.suggestionCount ?? 0
                }개 생성`,
            );
            await loadCalendarStatus();
            await refreshMyBriefing();
            await loadSuggestions();
        } catch (err) {
            showToast(
                err instanceof Error ? err.message : "캘린더 동기화 실패",
            );
        } finally {
            setCalendarSyncing(false);
        }
    }

    async function disconnectCalendar() {
        if (!window.confirm("Google Calendar 연결과 동기화된 개인 일정을 삭제할까요?")) {
            return;
        }
        setCalendarSyncing(true);
        try {
            const res = await fetch("/api/agents/calendar/status", {
                method: "DELETE",
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "캘린더 연결 해제 실패");
            setCalendarStatus({ connected: false, connection: null });
            showToast("Google Calendar 연결을 해제했습니다");
            await loadSuggestions();
        } catch (error) {
            showToast(
                error instanceof Error
                    ? error.message
                    : "캘린더 연결 해제 실패",
            );
        } finally {
            setCalendarSyncing(false);
        }
    }

    async function rebuildMyBriefing() {
        setGenerating(true);
        try {
            const count = await refreshMyBriefing();
            showToast(
                count > 0
                    ? "원본 데이터 기준으로 브리핑을 다시 만들었습니다"
                    : "오늘 만들 브리핑 내용이 없습니다",
            );
        } catch (err) {
            showToast(err instanceof Error ? err.message : "브리핑 갱신 실패");
        } finally {
            setGenerating(false);
        }
    }

    async function sendTestBriefing() {
        setTestSending(true);
        try {
            const count = await refreshMyBriefing();
            if (count === 0) {
                showToast("보낼 브리핑 내용이 없습니다");
                return;
            }
            const res = await fetch("/api/agents/notifications/test", {
                method: "POST",
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "테스트 발송 실패");
            showToast("개인 Google Chat으로 테스트 브리핑을 보냈습니다");
        } catch (err) {
            showToast(err instanceof Error ? err.message : "테스트 발송 실패");
        } finally {
            setTestSending(false);
        }
    }

    async function removeCardItem(
        suggestionId: number,
        sectionIndex: number,
        widgetIndex: number,
    ) {
        setWorkingId(suggestionId);
        try {
            const res = await fetch(`/api/agents/suggestions/${suggestionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "removeWidget",
                    sectionIndex,
                    widgetIndex,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "항목 삭제 실패");
            showToast("오늘 브리핑에서 제외했습니다");
            await loadSuggestions();
        } catch (err) {
            showToast(err instanceof Error ? err.message : "항목 삭제 실패");
        } finally {
            setWorkingId(null);
        }
    }

    function editCardItem(
        suggestionId: number,
        sectionIndex: number,
        widgetIndex: number,
        currentHtml: string,
    ) {
        setEditingBriefingItem({
            suggestionId,
            sectionIndex,
            widgetIndex,
            text: cardHtmlToPlainText(currentHtml),
        });
    }

    async function saveBriefingItemEdit() {
        if (!editingBriefingItem) return;
        const nextText = editingBriefingItem.text.trim();
        if (!nextText) {
            showToast("빈 내용으로 수정할 수 없습니다");
            return;
        }

        const { suggestionId, sectionIndex, widgetIndex } = editingBriefingItem;
        setBriefingEditSaving(true);
        setWorkingId(suggestionId);
        try {
            const res = await fetch(`/api/agents/suggestions/${suggestionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "editWidget",
                    sectionIndex,
                    widgetIndex,
                    text: nextText,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "항목 수정 실패");
            showToast("브리핑 항목을 수정했습니다");
            setEditingBriefingItem(null);
            await loadSuggestions();
        } catch (err) {
            showToast(err instanceof Error ? err.message : "항목 수정 실패");
        } finally {
            setBriefingEditSaving(false);
            setWorkingId(null);
        }
    }

    async function saveWebhook() {
        setWebhookSaving(true);
        try {
            const res = await fetch("/api/agents/webhook", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ webhookUrl }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "Webhook 저장 실패");
            setWebhookConfigured(Boolean(json.configured));
            setWebhookUrl("");
            showToast("개인 webhook을 저장했습니다");
            await loadWebhook();
        } catch (err) {
            showToast(err instanceof Error ? err.message : "Webhook 저장 실패");
        } finally {
            setWebhookSaving(false);
        }
    }

    async function deleteWebhook() {
        if (!window.confirm("개인 Google Chat Webhook을 삭제할까요?")) return;
        setWebhookSaving(true);
        try {
            const res = await fetch("/api/agents/webhook", {
                method: "DELETE",
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "Webhook 삭제 실패");
            setWebhookUrl("");
            setWebhookConfigured(false);
            showToast("개인 Webhook을 삭제했습니다");
            await loadWebhook();
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "Webhook 삭제 실패",
            );
        } finally {
            setWebhookSaving(false);
        }
    }

    async function saveMemberWebhook(targetMember: string) {
        if (!isAdmin) return;
        setSavingMemberWebhook(targetMember);
        try {
            const res = await fetch("/api/agents/webhook", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    member: targetMember,
                    webhookUrl: memberWebhookDrafts[targetMember] ?? "",
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "Webhook 저장 실패");
            showToast(`${targetMember} webhook을 저장했습니다`);
            await loadWebhook();
        } catch (err) {
            showToast(err instanceof Error ? err.message : "Webhook 저장 실패");
        } finally {
            setSavingMemberWebhook(null);
        }
    }

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f7f6f3] pb-24">
                <div className="sticky top-0 z-10 border-b border-stone-200 bg-white px-4 py-3">
                    <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h1 className="text-base font-bold text-stone-900">
                                모닝 알림 에이전트
                            </h1>
                            <p className="mt-0.5 text-xs text-stone-400">
                                일정, 업무, 오늘의 퀘스트를 모아 개인 Google Chat으로 보냅니다.
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setWebhookModalOpen(true)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
                                aria-label="Google Chat webhook 설정"
                                title="Google Chat webhook 설정"
                            >
                                <i className="ri-settings-3-line text-lg" />
                            </button>
                            <AgentButton />
                            <NotificationButton />
                            <TeamSwitcher />
                            <UserMenu />
                        </div>
                    </div>
                </div>

                <main className="mx-auto max-w-2xl px-4 py-4">
                    <section className="mb-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-bold text-stone-900">
                                    Google Calendar
                                </h2>
                                <p className="mt-1 text-xs leading-relaxed text-stone-500">
                                    오늘 회의와 일정을 브리핑에 자동으로 넣습니다.
                                </p>
                            </div>
                            <span
                                className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${
                                    calendarStatus?.connected
                                        ? "bg-green-100 text-green-700"
                                        : "bg-stone-100 text-stone-500"
                                }`}
                            >
                                {calendarLoading
                                    ? "확인 중"
                                    : calendarStatus?.connected
                                      ? "연결됨"
                                      : "미연결"}
                            </span>
                        </div>
                        {calendarStatus?.connection && (
                            <p className="mt-2 text-[11px] text-stone-400">
                                {calendarStatus.connection.google_email ||
                                    calendarStatus.connection.email}{" "}
                                · {formatDateTime(calendarStatus.connection.updated_at)}
                            </p>
                        )}
                        <div
                            className={`mt-3 grid gap-2 ${
                                calendarStatus?.connected
                                    ? "grid-cols-3"
                                    : "grid-cols-2"
                            }`}
                        >
                            <a
                                href="/api/agents/calendar/connect"
                                className="rounded-lg bg-stone-900 px-3 py-2 text-center text-xs font-bold text-white"
                            >
                                {calendarStatus?.connected ? "다시 연결" : "캘린더 연결"}
                            </a>
                            <button
                                type="button"
                                onClick={syncCalendar}
                                disabled={!calendarStatus?.connected || calendarSyncing}
                                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-600 disabled:opacity-50"
                            >
                                {calendarSyncing ? "동기화 중" : "오늘 일정 동기화"}
                            </button>
                            {calendarStatus?.connected && (
                                <button
                                    type="button"
                                    onClick={disconnectCalendar}
                                    disabled={calendarSyncing}
                                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-50"
                                >
                                    연결 해제
                                </button>
                            )}
                        </div>
                    </section>

                    <section className="mb-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-bold text-stone-900">
                                    모닝 브리핑 자동 발송
                                </h2>
                                <p className="mt-1 text-xs leading-relaxed text-stone-500">
                                    평일 오전 8시 30분에 개인 Google Chat으로 자동 발송됩니다.
                                    공휴일에는 발송하지 않습니다.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => void sendTestBriefing()}
                                disabled={
                                    settingsLoading ||
                                    testSending ||
                                    !webhookConfigured
                                }
                                className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:border-stone-200 disabled:bg-stone-50 disabled:text-stone-300"
                            >
                                {testSending ? "발송 중" : "테스트 발송"}
                            </button>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                            <i className="ri-time-line text-base text-stone-400" />
                            <span className="font-bold text-stone-900">08:30</span>
                            <span className="text-xs text-stone-500">
                                Vercel Hobby 환경에서는 팀 공통 시간으로 운영합니다.
                            </span>
                        </div>
                    </section>

                    <section className="mb-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-bold text-stone-900">
                                    내 브리핑 미리보기
                                </h2>
                                <p className="mt-1 text-xs leading-relaxed text-stone-500">
                                    오늘 발송될 내용을 미리 확인합니다. 항목 수정/제외는 오늘 브리핑에만 반영됩니다.
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => void rebuildMyBriefing()}
                                    disabled={generating}
                                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                                    aria-label="원본 데이터 기준으로 브리핑 다시 만들기"
                                    title="업무, 일정, 접근성 인증 기준으로 오늘 브리핑을 다시 만듭니다"
                                >
                                    <i
                                        className={`ri-refresh-line text-base ${
                                            generating ? "animate-spin" : ""
                                        }`}
                                    />
                                    <span>{generating ? "갱신 중" : "다시 만들기"}</span>
                                </button>
                            </div>
                        </div>

                        <div className="mb-3 rounded-lg bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-500">
                            <b className="text-stone-700">다시 만들기</b>는 업무,
                            오늘 일정, 접근성 인증 상태를 다시 읽어 브리핑을 재생성합니다.
                            미리보기에서 제외하거나 수정한 내용은 이 버튼을 누르면 원본 기준으로
                            초기화됩니다.
                        </div>

                        {suggestionsLoading ? (
                            <EmptyState text="브리핑을 불러오는 중" />
                        ) : suggestions.length === 0 ? (
                            <EmptyState text="오늘 미리볼 브리핑이 없습니다" />
                        ) : (
                            <div className="space-y-3">
                                {suggestions.map((suggestion) => {
                                    const card = getPayloadCard(suggestion);
                                    const text = getPayloadText(suggestion);
                                    const busy = workingId === suggestion.id;
                                    return (
                                        <article
                                            key={suggestion.id}
                                            className="rounded-xl border border-stone-200 bg-stone-50 p-3"
                                        >
                                            <div className="mb-2">
                                                <div className="min-w-0">
                                                    <h3 className="break-words text-sm font-bold text-stone-900">
                                                        {suggestion.title}
                                                    </h3>
                                                    <p className="mt-1 break-words text-xs text-stone-500">
                                                        {suggestion.summary}
                                                    </p>
                                                </div>
                                            </div>
                                            {card ? (
                                                <GoogleChatCardPreview
                                                    card={card}
                                                    suggestionId={suggestion.id}
                                                    busy={busy}
                                                    onEditItem={editCardItem}
                                                    onRemoveItem={removeCardItem}
                                                />
                                            ) : text ? (
                                                <pre className="whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs leading-relaxed text-stone-700">
                                                    {text}
                                                </pre>
                                            ) : null}
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                </main>

                {toast && (
                    <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-stone-800 px-5 py-2.5 text-sm text-white shadow-lg">
                        {toast}
                    </div>
                )}

                {webhookModalOpen && (
                    <WebhookModal
                        isAdmin={isAdmin}
                        member={member}
                        webhookUrl={webhookUrl}
                        webhookConfigured={webhookConfigured}
                        webhookLoading={webhookLoading}
                        webhookSaving={webhookSaving}
                        memberWebhooks={memberWebhooks}
                        memberWebhookDrafts={memberWebhookDrafts}
                        savingMemberWebhook={savingMemberWebhook}
                        teamCalendar={teamCalendar}
                        teamCalendarId={teamCalendarId}
                        teamEventMembers={teamEventMembers}
                        memberCalendarIds={memberCalendarIds}
                        teamCalendarSaving={teamCalendarSaving}
                        onClose={() => setWebhookModalOpen(false)}
                        onWebhookUrlChange={setWebhookUrl}
                        onMemberWebhookDraftChange={setMemberWebhookDrafts}
                        onSaveWebhook={saveWebhook}
                        onDeleteWebhook={deleteWebhook}
                        onSaveMemberWebhook={saveMemberWebhook}
                        onTeamCalendarIdChange={setTeamCalendarId}
                        onMemberCalendarIdsChange={setMemberCalendarIds}
                        onSaveTeamCalendarSettings={saveTeamCalendarSettings}
                    />
                )}
                {editingBriefingItem && (
                    <BriefingItemEditModal
                        value={editingBriefingItem.text}
                        saving={briefingEditSaving}
                        onChange={(text) =>
                            setEditingBriefingItem((prev) =>
                                prev ? { ...prev, text } : prev,
                            )
                        }
                        onClose={() => {
                            if (!briefingEditSaving) {
                                setEditingBriefingItem(null);
                            }
                        }}
                        onSave={saveBriefingItemEdit}
                    />
                )}
            </div>
        </AuthGuard>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="rounded-xl border border-dashed border-stone-200 bg-white p-6 text-center text-sm text-stone-400">
            {text}
        </div>
    );
}

function GoogleChatCardPreview({
    card,
    suggestionId,
    busy,
    onEditItem,
    onRemoveItem,
}: {
    card: GoogleChatCardPayload;
    suggestionId: number;
    busy: boolean;
    onEditItem: (
        suggestionId: number,
        sectionIndex: number,
        widgetIndex: number,
        currentHtml: string,
    ) => void;
    onRemoveItem: (
        suggestionId: number,
        sectionIndex: number,
        widgetIndex: number,
    ) => void;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-100 bg-amber-50 px-4 py-3">
                <p className="text-sm font-bold text-stone-900">{card.title}</p>
                {card.subtitle && (
                    <p className="mt-1 text-xs text-amber-700">
                        {card.subtitle}
                    </p>
                )}
            </div>
            <div className="space-y-3 p-4">
                {card.sections.map((section, sectionIdx) => (
                    <div
                        key={`${suggestionId}-${sectionIdx}`}
                        className="space-y-2"
                    >
                        {section.header && (
                            <p className="text-xs font-bold text-stone-500">
                                {section.header}
                            </p>
                        )}
                        {section.widgets.map((widget, widgetIdx) => {
                            const editable = Boolean(section.header);
                            return (
                            <div
                                key={`${suggestionId}-${sectionIdx}-${widgetIdx}`}
                                className="group flex items-start gap-2 rounded-lg bg-stone-50 px-3 py-2"
                            >
                                <div
                                    className="min-w-0 flex-1 text-xs leading-relaxed text-stone-700"
                                    dangerouslySetInnerHTML={{
                                        __html: sanitizeHtml(widget.textParagraph.text),
                                    }}
                                />
                                {editable && (
                                <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                            onEditItem(
                                                suggestionId,
                                                sectionIdx,
                                                widgetIdx,
                                                widget.textParagraph.text,
                                            )
                                        }
                                        className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-white hover:text-amber-600 disabled:opacity-50"
                                        aria-label="항목 수정"
                                        title="항목 수정"
                                    >
                                        <i className="ri-pencil-line text-base" />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                            onRemoveItem(
                                                suggestionId,
                                                sectionIdx,
                                                widgetIdx,
                                            )
                                        }
                                        className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-white hover:text-red-500 disabled:opacity-50"
                                        aria-label="오늘 브리핑에서 제외"
                                        title="오늘 브리핑에서 제외"
                                    >
                                        <i className="ri-delete-bin-line text-base" />
                                    </button>
                                </div>
                                )}
                            </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

function BriefingItemEditModal({
    value,
    saving,
    onChange,
    onClose,
    onSave,
}: {
    value: string;
    saving: boolean;
    onChange: (value: string) => void;
    onClose: () => void;
    onSave: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-stone-900">
                            브리핑 문구 수정
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-stone-400">
                            이 수정은 오늘 브리핑 미리보기에만 반영됩니다.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-50 disabled:opacity-50"
                        aria-label="닫기"
                    >
                        <i className="ri-close-line text-xl" />
                    </button>
                </div>

                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={saving}
                    rows={7}
                    className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm leading-relaxed text-stone-800 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 disabled:opacity-60"
                />

                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-600 disabled:opacity-50"
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving || !value.trim()}
                        className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                        {saving ? "저장 중" : "저장"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function WebhookModal({
    isAdmin,
    member,
    webhookUrl,
    webhookConfigured,
    webhookLoading,
    webhookSaving,
    memberWebhooks,
    memberWebhookDrafts,
    savingMemberWebhook,
    teamCalendar,
    teamCalendarId,
    teamEventMembers,
    memberCalendarIds,
    teamCalendarSaving,
    onClose,
    onWebhookUrlChange,
    onMemberWebhookDraftChange,
    onSaveWebhook,
    onDeleteWebhook,
    onSaveMemberWebhook,
    onTeamCalendarIdChange,
    onMemberCalendarIdsChange,
    onSaveTeamCalendarSettings,
}: {
    isAdmin: boolean;
    member: string | null;
    webhookUrl: string;
    webhookConfigured: boolean;
    webhookLoading: boolean;
    webhookSaving: boolean;
    memberWebhooks: MemberWebhook[];
    memberWebhookDrafts: Record<string, string>;
    savingMemberWebhook: string | null;
    teamCalendar: TeamCalendarSettings | null;
    teamCalendarId: string;
    teamEventMembers: string[];
    memberCalendarIds: Record<string, string>;
    teamCalendarSaving: boolean;
    onClose: () => void;
    onWebhookUrlChange: (value: string) => void;
    onMemberWebhookDraftChange: React.Dispatch<
        React.SetStateAction<Record<string, string>>
    >;
    onSaveWebhook: () => void;
    onDeleteWebhook: () => void;
    onSaveMemberWebhook: (member: string) => void;
    onTeamCalendarIdChange: (value: string) => void;
    onMemberCalendarIdsChange: React.Dispatch<
        React.SetStateAction<Record<string, string>>
    >;
    onSaveTeamCalendarSettings: () => void;
}) {
    const [activeTab, setActiveTab] = useState<"chat" | "calendar">("chat");

    return (
        <div
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-stone-900">
                            연동 설정
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-stone-400">
                            Google Chat webhook과 팀 캘린더 ID를 관리합니다.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-50"
                        aria-label="닫기"
                    >
                        <i className="ri-close-line text-xl" />
                    </button>
                </div>

                <div className="mb-4 grid grid-cols-2 rounded-xl bg-stone-100 p-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab("chat")}
                        className={`rounded-lg px-3 py-2 text-sm font-bold ${
                            activeTab === "chat"
                                ? "bg-white text-stone-900 shadow-sm"
                                : "text-stone-500 hover:text-stone-800"
                        }`}
                    >
                        Google Chat
                    </button>
                    <button
                        type="button"
                        onClick={() => isAdmin && setActiveTab("calendar")}
                        disabled={!isAdmin}
                        className={`rounded-lg px-3 py-2 text-sm font-bold ${
                            activeTab === "calendar"
                                ? "bg-white text-stone-900 shadow-sm"
                                : "text-stone-500 hover:text-stone-800"
                        } disabled:text-stone-300`}
                    >
                        Google Calendar
                    </button>
                </div>

                {activeTab === "chat" && (
                    <>
                        <section className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-bold text-stone-900">
                                        내 개인 webhook
                                    </h3>
                                    <p className="mt-1 text-xs leading-relaxed text-stone-400">
                                        {member
                                            ? `${member} 개인 DM 알림 주소입니다.`
                                            : "개인 DM 알림 주소입니다."}
                                    </p>
                                </div>
                                <span
                                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${
                                        webhookConfigured
                                            ? "bg-green-100 text-green-700"
                                            : "bg-white text-stone-500"
                                    }`}
                                >
                                    {webhookConfigured ? "등록됨" : "미등록"}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <SensitiveInput
                                    type="url"
                                    value={webhookUrl}
                                    disabled={webhookLoading}
                                    onChange={onWebhookUrlChange}
                                    placeholder={
                                        webhookConfigured
                                            ? "등록된 webhook은 숨김 처리됨"
                                            : "https://chat.googleapis.com/v1/spaces/..."
                                    }
                                />
                                <button
                                    type="button"
                                    onClick={onSaveWebhook}
                                    disabled={webhookLoading || webhookSaving}
                                    className="shrink-0 rounded-lg bg-stone-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                                >
                                    {webhookSaving ? "저장 중" : "저장"}
                                </button>
                                {webhookConfigured && (
                                    <button
                                        type="button"
                                        onClick={onDeleteWebhook}
                                        disabled={webhookLoading || webhookSaving}
                                        className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-600 disabled:opacity-50"
                                    >
                                        삭제
                                    </button>
                                )}
                            </div>
                        </section>

                        {isAdmin && memberWebhooks.length > 0 && (
                            <section className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
                                <div className="mb-3">
                                    <h3 className="text-sm font-bold text-stone-900">
                                        팀원 webhook 관리
                                    </h3>
                                    <p className="mt-1 text-xs leading-relaxed text-stone-400">
                                        등록된 webhook 원문은 보안상 숨깁니다. 변경할 때만 새 URL을 입력하세요.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    {memberWebhooks.map((row) => (
                                        <div
                                            key={row.member}
                                            className="rounded-lg border border-stone-100 bg-stone-50 p-3"
                                        >
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-stone-800">
                                                        {row.member}
                                                    </p>
                                                    <p className="truncate text-[11px] text-stone-400">
                                                        {row.email}
                                                    </p>
                                                </div>
                                                <span
                                                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${
                                                        row.configured
                                                            ? "bg-green-100 text-green-700"
                                                            : "bg-white text-stone-500"
                                                    }`}
                                                >
                                                    {row.configured ? "등록됨" : "미등록"}
                                                </span>
                                            </div>
                                            <div className="flex gap-2">
                                                <SensitiveInput
                                                    type="url"
                                                    value={
                                                        memberWebhookDrafts[row.member] ??
                                                        ""
                                                    }
                                                    onChange={(value) =>
                                                        onMemberWebhookDraftChange(
                                                            (prev) => ({
                                                                ...prev,
                                                                [row.member]: value,
                                                            }),
                                                        )
                                                    }
                                                    placeholder={
                                                        row.configured
                                                            ? "등록된 webhook은 숨김 처리됨"
                                                            : "https://chat.googleapis.com/v1/spaces/..."
                                                    }
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onSaveMemberWebhook(row.member)
                                                    }
                                                    disabled={
                                                        savingMemberWebhook === row.member
                                                    }
                                                    className="shrink-0 rounded-lg bg-stone-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                                                >
                                                    {savingMemberWebhook === row.member
                                                        ? "저장 중"
                                                        : "저장"}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}

                {activeTab === "calendar" && isAdmin && (
                    <section className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-stone-900">
                                    팀 캘린더 ID 관리
                                </h3>
                                <p className="mt-1 text-xs leading-relaxed text-stone-400">
                                    업무는 담당자별 캘린더에, 회의·휴가·시차·공통 일정은 공용 캘린더에 등록합니다.
                                </p>
                            </div>
                            {teamCalendar && (
                                <span className="shrink-0 rounded-full bg-green-100 px-2 py-1 text-[11px] font-bold text-green-700">
                                    저장됨
                                </span>
                            )}
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-stone-600">
                                    공용 팀 캘린더
                                </label>
                                <SensitiveInput
                                    value={teamCalendarId}
                                    onChange={onTeamCalendarIdChange}
                                    placeholder="abcd1234@group.calendar.google.com"
                                />
                            </div>
                            <div className="space-y-2">
                                {teamEventMembers.map((name) => (
                                    <div
                                        key={name}
                                        className="grid grid-cols-[4.5rem_1fr] items-center gap-2"
                                    >
                                        <span className="text-xs font-bold text-stone-600">
                                            {name}
                                        </span>
                                        <SensitiveInput
                                            value={memberCalendarIds[name] ?? ""}
                                            onChange={(value) =>
                                                onMemberCalendarIdsChange((prev) => ({
                                                    ...prev,
                                                    [name]: value,
                                                }))
                                            }
                                            placeholder={`${name} 캘린더 ID`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
                            현재 연결된 Google 계정으로 저장된 캘린더 ID에만 쓰기 요청을 보냅니다.
                        </p>
                        <button
                            type="button"
                            onClick={onSaveTeamCalendarSettings}
                            disabled={teamCalendarSaving}
                            className="mt-4 w-full rounded-lg bg-stone-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                            {teamCalendarSaving ? "저장 중" : "저장"}
                        </button>
                    </section>
                )}
            </div>
        </div>
    );
}

function SensitiveInput({
    value,
    onChange,
    placeholder,
    disabled = false,
    type = "text",
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    disabled?: boolean;
    type?: "text" | "url";
}) {
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative min-w-0 flex-1">
            <input
                type={visible ? type : "password"}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 disabled:bg-stone-50 disabled:text-stone-400"
            />
            <button
                type="button"
                onClick={() => setVisible((prev) => !prev)}
                disabled={disabled}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40"
                aria-label={visible ? "값 숨기기" : "값 보기"}
                title={visible ? "숨기기" : "보기"}
            >
                <i className={`${visible ? "ri-eye-line" : "ri-eye-off-line"} text-base`} />
            </button>
        </div>
    );
}
