"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/infrastructure/supabase/client";
import {
    calcLevel,
    getNextLevel,
    expBar,
    rpcAttendanceCheck,
    LEVELS,
    rpcSetQuestDone,
} from "@/features/gamification/maple";
import { useAuth } from "@/components/AuthProvider";
import AuthGuard from "@/components/AuthGuard";
import Tooltip from "@/components/Tooltip";
import UserMenu from "@/components/UserMenu";
import TeamSwitcher from "@/components/TeamSwitcher";
import NotificationButton from "@/components/NotificationButton";
import Avatar from "@/components/Avatar";
import TaskEditModal from "@/components/TaskEditModal";
import TaskContentList from "@/components/TaskContentList";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { ko } from "date-fns/locale";
import { useRouter } from "next/navigation";
import type { Player, Task, Quest, Season, SeasonRecord, SeasonAward } from "@/shared/types";
import { formatWorkload } from "@/shared/utils/utils";
import {
    BAR_COLORS,
    getMemberColors,
    normalizeStatus,
} from "@/shared/constants";
import { toLocalYmd } from "@/shared/utils/toLocalYmd";
import Select from "react-select";
import { taskFilterProjectSelectStyles } from "@/shared/styles/reactSelectStyles";
import {
    ACHIEVEMENT_TITLES,
    TITLES_BY_ID,
    RARITY_ORDER,
    RARITY_LABEL,
    RARITY_STYLE,
} from "@/features/gamification/titles";

function getThisWeekRange() {
    const now = new Date();
    const day = now.getDay();
    const wed = new Date(now);
    wed.setDate(now.getDate() - ((day + 4) % 7));
    wed.setHours(0, 0, 0, 0);
    const nextWed = new Date(wed);
    nextWed.setDate(wed.getDate() + 7);
    return {
        from: toLocalYmd(wed),
        to: toLocalYmd(nextWed),
    };
}

function ymdToLocalDate(value: string | null | undefined, endOfDay = false) {
    if (!value) return null;
    const d = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (endOfDay) d.setHours(23, 59, 59, 999);
    return d;
}

function taskOverlapsRange(task: Task, start: Date, end: Date) {
    const taskStart =
        ymdToLocalDate(task.start_date) ?? ymdToLocalDate(task.end_date);
    const taskEnd =
        ymdToLocalDate(task.end_date, true) ??
        ymdToLocalDate(task.start_date, true);

    if (!taskStart || !taskEnd) return false;
    return taskStart <= end && taskEnd >= start;
}

/**
 * 업무 자체 일정 또는 content_items 개별 일정이 [from, to] (YYYY-MM-DD)와 겹치는지.
 * 공수 달력·날짜별 목록·월별 집계가 같은 기준을 쓰도록 공통화한다.
 */
function taskOverlapsYmd(task: Task, from: string, to: string) {
    const s = task.start_date || task.end_date;
    const e = task.end_date || task.start_date;
    if (s && e && s <= to && e >= from) return true;
    return (task.content_items ?? []).some((ci) => {
        const cs = ci.start_date || ci.end_date;
        const ce = ci.end_date || ci.start_date;
        return !!cs && !!ce && cs <= to && ce >= from;
    });
}

function avatarStoragePath(publicUrl: string | null | undefined) {
    if (!publicUrl) return null;
    try {
        const marker = "/storage/v1/object/public/avatars/";
        const path = new URL(publicUrl).pathname;
        const markerIndex = path.indexOf(marker);
        if (markerIndex < 0) return null;
        const objectPath = decodeURIComponent(path.slice(markerIndex + marker.length));
        if (!objectPath || objectPath.includes("..")) return null;
        return objectPath;
    } catch {
        return null;
    }
}

export default function ProfilePage() {
    const {
        member,
        members,
        refreshAvatar,
        role,
        teamId,
        playerId,
        avatarUrl,
    } = useAuth();
    const isGuest = member === "GUEST" || role === "guest";

    const fileInputRef = useRef<HTMLInputElement>(null);

    // useState 선언
    const [tab, setTab] = useState<"info" | "history" | "titles" | "quests">("info");
    const [players, setPlayers] = useState<Player[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [weekTasks, setWeekTasks] = useState<Task[]>([]);
    const [toast, setToast] = useState("");
    const [historyFilter, setHistoryFilter] = useState<
        "week" | "lastweek" | "month" | "custom"
    >("week");
    const [historyProjFilter, setHistoryProjFilter] = useState("");
    const [historyStatusFilter, setHistoryStatusFilter] = useState("");
    const [historyView] = useState<"list" | "effort">("effort");
    const [effortCalProj, setEffortCalProj] = useState<string>("");
    const [effortCalMonth, setEffortCalMonth] = useState(() => new Date());
    const [effortCalDay, setEffortCalDay] = useState<string | null>(null);
    const [effortCalPicker, setEffortCalPicker] = useState<"year" | "month" | null>(null);
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [isAttending, setIsAttending] = useState(false);
    const [showAvatarMenu, setShowAvatarMenu] = useState(false);
    const [historyEditTask, setHistoryEditTask] = useState<Task | null>(null);
    const [completedQuests, setCompletedQuests] = useState<Quest[]>([]);
    const [seasonHistory, setSeasonHistory] = useState<
        { season: Season; record: SeasonRecord | null; awards: SeasonAward[] }[]
    >([]);

    const canEditHistoryTask = (taskMember: string) =>
        !isGuest && (role === "admin" || taskMember === member);

    const loadAll = useCallback(async () => {
        if (!teamId) return;
        const [
            { data: playerData },
            { data: taskData },
            { data: teamTaskData },
            { data: completedQuestData },
        ] = await Promise.all([
            supabase.from("players").select("*").eq("team_id", teamId),
            supabase
                .from("tasks")
                .select("*")
                .eq("team_id", teamId)
                .eq("member", member)
                .order("created_at", { ascending: false }),
            supabase.from("tasks").select("*").eq("team_id", teamId).in("member", members),
            isGuest
                ? Promise.resolve({ data: [] as Quest[] })
                : supabase
                      .from("quests")
                      .select("*")
                      .eq("team_id", teamId)
                      .eq("member", member)
                      .eq("status", "완료")
                      .order("created_at", { ascending: false }),
        ]);
        setPlayers(playerData || []);
        setTasks(taskData || []);
        setCompletedQuests((completedQuestData as Quest[]) || []);

        const wr = getThisWeekRange();
        const weekly = (teamTaskData || []).filter((t) => {
            const s = t.start_date || t.end_date;
            if (!s) return false;
            return s >= wr.from && s < wr.to;
        });
        setWeekTasks(weekly);
    }, [isGuest, member, members, teamId]);

    useEffect(() => {
        if (member && teamId) void loadAll();
    }, [loadAll, member, teamId]); // member와 현재 팀이 준비된 뒤 실행

    const router = useRouter();

    useEffect(() => {
        setSeasonHistory([]); // 팀/멤버 전환 시 이전 데이터 초기화
        if (!teamId || !member) return;
        let cancelled = false;
        void (async () => {
            const { data: seasons } = await supabase
                .from("seasons")
                .select("*")
                .eq("team_id", teamId)
                .order("range_start", { ascending: false });
            if (cancelled) return;
            if (!seasons?.length) return;

            // player_id 우선 매칭, 없으면 이름 폴백 (개명 대응)
            const [{ data: records }, { data: awards }] = await Promise.all([
                supabase.from("season_records").select("*").eq("team_id", teamId),
                supabase.from("season_awards").select("*").eq("team_id", teamId),
            ]);
            if (cancelled) return;

            const isMine = (row: { player_id: number | null; member: string }) =>
                row.player_id != null ? row.player_id === playerId : row.member === member;

            const myRecords = (records ?? []).filter(isMine) as SeasonRecord[];
            const myAwards = (awards ?? []).filter(isMine) as SeasonAward[];

            const history = seasons.map((s) => ({
                season: s as Season,
                record: myRecords.find((r) => r.season_id === s.id) ?? null,
                awards: myAwards.filter((a) => a.season_id === s.id),
            }));
            if (!cancelled) setSeasonHistory(history);
        })();
        return () => { cancelled = true; };
    }, [teamId, member, playerId]);

    async function deleteHistoryTask(id: number) {
        if (!confirm("정말 삭제하시겠어요?")) return;
        try {
            const res = await fetch(`/api/agents/team-calendar/tasks/${id}`, {
                method: "DELETE",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json.message || "팀 캘린더 일정 삭제 실패");
            }
        } catch (err) {
            if (
                !confirm(
                    `${err instanceof Error ? err.message : "팀 캘린더 일정 삭제 실패"}\n그래도 업무를 삭제할까요?`,
                )
            ) {
                return;
            }
        }
        const { error } = await supabase.from("tasks").delete().eq("id", id);
        if (error) {
            showToastMsg("삭제 실패: " + error.message);
            return;
        }
        showToastMsg("삭제되었어요");
        await loadAll();
    }

    function showToastMsg(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    }

    async function undoCompletedQuest(id: number) {
        // 완료 취소 → 서버 RPC 가 상태 되돌림 + 점수 차감(-10).
        if (member) await rpcSetQuestDone(id, false, member).catch(() => null);
        await loadAll();
    }

    async function uploadAvatar(file: File) {
        if (!member || !teamId || !playerId) return;
        const allowedTypes: Record<string, string> = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
        };
        const ext = allowedTypes[file.type];
        if (!ext) {
            showToastMsg("JPG, PNG, WEBP, GIF 이미지만 업로드할 수 있어요.");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToastMsg("프로필 이미지는 5MB 이하여야 해요.");
            return;
        }
        // 고정 경로에 upsert 하면 DB 갱신이 실패해도 기존 이미지가 이미 덮인 뒤다.
        // 파일마다 다른 경로에 올리고, 이전 파일은 DB 갱신이 성공한 뒤에만 지운다.
        // (같은 파일을 다시 올리면 경로가 같지만 내용이 동일하므로 덮어써도 무해하다)
        const fileName = `player-${playerId}-${file.lastModified}-${file.size}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(fileName, file, { upsert: true });

        if (uploadError) {
            showToastMsg("업로드 실패: " + uploadError.message);
            return;
        }

        const { data } = supabase.storage
            .from("avatars")
            .getPublicUrl(fileName);
        const url = `${data.publicUrl}?t=${file.lastModified}`;

        const { error: avatarUpdateError } = await supabase
            .from("players")
            .update({ avatar_url: url })
            .eq("team_id", teamId)
            .eq("id", playerId);
        if (avatarUpdateError) {
            // 방금 올린 파일은 아무도 참조하지 않으므로 되돌린다.
            await supabase.storage.from("avatars").remove([fileName]);
            showToastMsg("프로필 이미지 저장에 실패했어요");
            return;
        }

        const previousPath = avatarStoragePath(avatarUrl);
        if (previousPath && previousPath !== fileName) {
            await supabase.storage.from("avatars").remove([previousPath]);
        }
        showToastMsg("프로필 이미지 업데이트 완료!");
        refreshAvatar();
        loadAll();
    }

    async function deleteAvatar() {
        if (!member || !teamId || !playerId) return;
        const objectPath = avatarStoragePath(avatarUrl);

        // 파일을 먼저 지우면 DB 갱신 실패 시 avatar_url 이 없는 파일을 가리킨다.
        const { error: avatarDeleteError } = await supabase
            .from("players")
            .update({ avatar_url: null })
            .eq("team_id", teamId)
            .eq("id", playerId);
        if (avatarDeleteError) {
            showToastMsg("프로필 이미지 삭제에 실패했어요");
            return;
        }
        if (objectPath) {
            await supabase.storage.from("avatars").remove([objectPath]);
        }
        showToastMsg("프로필 이미지 삭제 완료!");
        refreshAvatar();
        loadAll();
    }

    async function handleAttend() {
        if (!member || isAttending) return;
        setIsAttending(true);
        try {
            const result = await rpcAttendanceCheck(member);
            if (!result.success) {
                showToastMsg(result.message || "오류");
                return;
            }
            showToastMsg(
                result.levelUp
                    ? `🎊 레벨업! ${result.newLv?.name}`
                    : `☀️ +${result.exp} EXP · ${result.streak}일 연속`,
            );
            await loadAll();
        } finally {
            setIsAttending(false);
        }
    }

    const player = players.find((p) => p.name === member);
    const myPlayer = player;
    const myAchievementTitles = ACHIEVEMENT_TITLES.filter(
        (t) => myPlayer && t.condition?.(myPlayer),
    );

    // player.icons에 저장된 시즌 수상 칭호 집계
    const iconCounts = (myPlayer?.icons ?? []).reduce<Record<string, number>>(
        (acc, id) => { acc[id] = (acc[id] || 0) + 1; return acc; },
        {},
    );
    const mySeasonTitles = Object.entries(iconCounts)
        .map(([id, count]) => ({ def: TITLES_BY_ID.get(id), count }))
        .filter((x): x is { def: NonNullable<typeof x.def>; count: number } => x.def !== undefined)
        .sort((a, b) => RARITY_ORDER[a.def.rarity] - RARITY_ORDER[b.def.rarity]);

    // 프로필 카드 상단에 표시할 대표 칭호 (레어리티 높은 순)
    const myTitles = [
        ...mySeasonTitles.map((x) => x.def),
        ...myAchievementTitles,
    ].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
    const lv = player ? calcLevel(player.exp) : LEVELS[0];
    const next = player ? getNextLevel(player.exp) : null;
    const pct = player ? expBar(player.exp) : 0;
    const today = toLocalYmd(new Date());
    const attended = player?.attend_last === today;
    const barColor =
        BAR_COLORS[Math.min((lv.level || 1) - 1, BAR_COLORS.length - 1)];

    // 지난 업무 필터
    const getHistoryTasks = () => {
        let start: Date;
        let end: Date;
        const today = new Date();

        if (historyFilter === "custom" && dateRange?.from) {
            start = new Date(dateRange.from);
            end = dateRange.to
                ? new Date(dateRange.to)
                : new Date(dateRange.from);
        } else if (historyFilter === "week") {
            start = new Date(today);
            start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
            end = new Date(today);
        } else if (historyFilter === "lastweek") {
            start = new Date(today);
            start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
            end = new Date(today);
            end.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 1);
        } else {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today);
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        return tasks.filter((t) => {
            if (!taskOverlapsRange(t, start, end)) return false;
            if (historyProjFilter && t.proj !== historyProjFilter) return false;
            if (
                historyStatusFilter &&
                normalizeStatus(t.status) !== historyStatusFilter
            )
                return false;
            return true;
        });
    };

    const historyTasks = getHistoryTasks();

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f7f6f3]">
                {/* 헤더 */}
                <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                    <div className="max-w-2xl mx-auto flex justify-between items-center">
                        <h1 className="text-base font-bold text-stone-900">
                            내 프로필
                        </h1>
                        <div className="flex items-center gap-2">
                            <TeamSwitcher />

                            <NotificationButton />
                            <UserMenu />
                        </div>
                    </div>
                </div>

                <div className="max-w-2xl mx-auto px-4 pt-4 pb-24">
                    {/* 프로필 카드 */}
                    <div className="bg-white rounded-2xl border border-stone-200 p-5 mb-4 text-center">
                        {/* 아바타 */}
                        <div className="relative w-16 h-16 mx-auto mb-3">
                            {isGuest ? (
                                <div className="w-16 h-16 rounded-full bg-stone-100 border-2 border-stone-200 flex items-center justify-center text-3xl">
                                    👤
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setShowAvatarMenu(true)}
                                        className="w-16 h-16 rounded-full overflow-hidden border-2 border-amber-200 relative"
                                    >
                                        {player?.avatar_url ? (
                                            <img
                                                src={player.avatar_url}
                                                alt={member ?? ""}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-amber-100 flex items-center justify-center text-2xl font-bold text-amber-700">
                                                {(member ?? "").slice(1)}
                                            </div>
                                        )}
                                        {/* 어두운 오버레이 */}
                                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-full">
                                            <svg
                                                width="18"
                                                height="18"
                                                viewBox="0 0 24 24"
                                                fill="white"
                                            >
                                                <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
                                                <path d="M9 3L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
                                            </svg>
                                        </div>
                                    </button>
                                    {/* 카메라 뱃지 */}
                                    <div className="absolute bottom-0 right-0 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center pointer-events-none">
                                        <svg
                                            width="10"
                                            height="10"
                                            viewBox="0 0 24 24"
                                            fill="white"
                                        >
                                            <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
                                            <path d="M9 3L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
                                        </svg>
                                    </div>
                                    {/* 숨겨진 파일 input */}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) uploadAvatar(file);
                                            setShowAvatarMenu(false);
                                        }}
                                    />
                                </>
                            )}
                        </div>

                        {/* 아바타 액션 시트 */}
                        {!isGuest && showAvatarMenu && (
                            <div
                                className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
                                onClick={() => setShowAvatarMenu(false)}
                            >
                                <div
                                    className="mb-[67px] max-h-[calc(100dvh-83px)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
                                        className="w-full px-4 py-4 text-sm font-medium text-amber-600 hover:bg-stone-50 transition-colors border-b border-stone-100"
                                    >
                                        사진 선택
                                    </button>
                                    {player?.avatar_url && (
                                        <button
                                            onClick={() => {
                                                setShowAvatarMenu(false);
                                                if (
                                                    confirm(
                                                        "프로필 이미지를 삭제할까요?",
                                                    )
                                                )
                                                    deleteAvatar();
                                            }}
                                            className="w-full px-4 py-4 text-sm font-medium text-red-500 hover:bg-stone-50 transition-colors border-b border-stone-100"
                                        >
                                            이미지 삭제
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setShowAvatarMenu(false)}
                                        className="w-full px-4 py-4 text-sm font-medium text-stone-500 hover:bg-stone-50 transition-colors"
                                    >
                                        취소
                                    </button>
                                </div>
                            </div>
                        )}
                        <h2 className="text-lg font-bold text-stone-900 mb-1">
                            {member}
                        </h2>
                        {isGuest ? (
                            <div className="inline-flex items-center gap-1 px-3 py-1 bg-stone-200 text-stone-600 rounded-full text-xs font-medium mb-3">
                                게스트
                            </div>
                        ) : (
                            <>
                                <div className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium mb-3">
                                    {lv.name}
                                </div>
                                {myTitles.length > 0 && (
                                    <div className="mb-4 flex flex-wrap justify-center gap-2">
                                        {myTitles.slice(0, 4).map((t) => {
                                            const s = RARITY_STYLE[t.rarity];
                                            return (
                                                <div
                                                    key={t.id}
                                                    className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-1.5 ${s.border} ${s.bg}`}
                                                >
                                                    <span className="text-base">{t.icon}</span>
                                                    <span className={`text-[11px] font-medium ${s.text}`}>{t.name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                <button
                                    onClick={() => void handleAttend()}
                                    disabled={attended || isAttending}
                                    className={`block mx-auto text-xs px-4 py-1.5 rounded-full font-medium mb-4 transition-all
                ${attended ? "bg-green-100 text-green-700" : "bg-amber-500 text-white"}`}
                                >
                                    {attended
                                        ? "✅ 출석완료"
                                        : isAttending
                                          ? "⏳ 처리 중..."
                                          : "☀️ 출석 체크"}
                                </button>
                            </>
                        )}

                        {/* EXP 바 */}
                        {!isGuest && (
                            <div className="mb-4">
                                <div className="flex justify-between text-xs text-stone-400 mb-1.5">
                                    <span>
                                        {player?.exp.toLocaleString() || 0} EXP
                                    </span>
                                    <span>{pct}%</span>
                                </div>
                                <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${pct}%`,
                                            background: barColor,
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-stone-400 text-right mt-1">
                                    {next
                                        ? `수련 중인 검사까지 ${(next.exp - (player?.exp || 0)).toLocaleString()} EXP`
                                        : "🌟 최고 레벨!"}
                                </p>
                            </div>
                        )}

                        {/* 스탯 */}
                        {!isGuest && (
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    {
                                        label: "누적 EXP",
                                        value:
                                            player?.exp.toLocaleString() || "0",
                                    },
                                    {
                                        label: "이번 달 EXP",
                                        value:
                                            player?.month_exp.toLocaleString() ||
                                            "0",
                                    },
                                    {
                                        label: "연속 출석",
                                        value: `${player?.attend_streak || 0}일`,
                                    },
                                ].map((s) => (
                                    <div
                                        key={s.label}
                                        className="bg-stone-50 rounded-xl p-3"
                                    >
                                        <div className="text-sm font-bold text-stone-800">
                                            {s.value}
                                        </div>
                                        <div className="text-xs text-stone-400 mt-0.5">
                                            {s.label}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 탭 */}
                    <div className="flex bg-white rounded-xl border border-stone-200 p-1 mb-4">
                        {[
                            { key: "info", label: "내 정보" },
                            { key: "history", label: "지난 업무" },
                            { key: "quests", label: "완료 퀘스트" },
                            { key: "titles", label: "성장" },
                        ].map((t) => (
                            <button
                                key={t.key}
                                onClick={() =>
                                    setTab(
                                        t.key as
                                            | "info"
                                            | "history"
                                            | "titles"
                                            | "quests",
                                    )
                                }
                                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all
                  ${tab === t.key ? "bg-amber-500 text-white" : "text-stone-500"}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* 내 정보 탭 */}
                    {tab === "info" && (
                        <div className="space-y-3">
                            {/* 랭킹 */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">
                                        이번 달 EXP 랭킹
                                    </span>
                                    <span className="text-xs text-stone-400">
                                        참고용
                                    </span>
                                </div>
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                    {[...players]
                                        .sort(
                                            (a, b) => b.month_exp - a.month_exp,
                                        )
                                        .map((p, i) => {
                                            const medals = [
                                                "🥇",
                                                "🥈",
                                                "🥉",
                                                "🏅",
                                            ];
                                            const plv = calcLevel(p.exp);
                                            const isLeader = p.role === "admin";
                                            return (
                                                <div
                                                    key={p.name}
                                                    className={`flex items-center gap-3 px-4 py-3
                      ${i < players.length - 1 ? "border-b border-stone-100" : ""}
                      ${p.name === member ? "bg-amber-50" : ""}`}
                                                >
                                                    <span className="text-base">
                                                        {medals[i] || "🏅"}
                                                    </span>
                                                    {/* 아바타 + 완장 */}
                                                    <div className="relative shrink-0">
                                                        <Avatar
                                                            name={p.name}
                                                            size={32}
                                                        />
                                                        {isLeader && (
                                                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs">
                                                                👑
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-sm font-medium text-stone-800">
                                                                {p.name}
                                                            </p>
                                                            {isLeader && (
                                                                <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium border border-yellow-200">
                                                                    리더
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-stone-400">
                                                            {plv.name}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-bold text-stone-800">
                                                            {p.month_exp.toLocaleString()}
                                                        </p>
                                                        <p className="text-xs text-stone-400">
                                                            EXP
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border border-stone-200 p-4 mb-3">
                                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-3">
                                    이번 주 팀원별 공수
                                </p>
                                <div className="space-y-3">
                                    {members.map((m) => {
                                        const mWL = weekTasks
                                            .filter((t) => t.member === m && !t.is_plan)
                                            .reduce(
                                                (s, t) => s + (t.workload || 0),
                                                0,
                                            );
                                        const maxWL = Math.max(
                                            ...members.map((mem) =>
                                                weekTasks
                                                    .filter(
                                                        (t) => t.member === mem && !t.is_plan,
                                                    )
                                                    .reduce(
                                                        (s, t) =>
                                                            s +
                                                            (t.workload || 0),
                                                        0,
                                                    ),
                                            ),
                                            1,
                                        );
                                        const c = getMemberColors(m);
                                        return (
                                            <div
                                                key={m}
                                                className="flex items-center gap-3"
                                            >
                                                <Avatar
                                                    name={m}
                                                    size={24}
                                                    showName
                                                />
                                                <div className="flex-1 relative h-2 bg-stone-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="absolute inset-y-0 left-0 rounded-full"
                                                        style={{
                                                            width: `${(mWL / maxWL) * 100}%`,
                                                            background: c.bar,
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-xs text-stone-500 w-10 text-right font-medium shrink-0">
                                                    {formatWorkload(mWL)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 시즌 기록 */}
                            {!isGuest && seasonHistory.length > 0 && (
                                <div>
                                    <div className="flex justify-between items-baseline mb-2">
                                        <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">
                                            🏆 시즌 기록
                                        </span>
                                        <button
                                            onClick={() => router.push("/hall-of-fame")}
                                            className="text-xs font-bold text-amber-600"
                                        >
                                            명예의 전당 →
                                        </button>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        {seasonHistory.map(({ season, record, awards: sAwards }) => {
                                            const isActive = season.status === "active";
                                            const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
                                            const MEDAL_RING: Record<number, string> = {
                                                1: "#f5c518",
                                                2: "#c0c0c0",
                                                3: "#cd7f32",
                                            };
                                            const medal = record ? MEDAL[record.rank] : null;
                                            const ringColor = record ? MEDAL_RING[record.rank] : null;
                                            return (
                                                <div
                                                    key={season.id}
                                                    className="rounded-xl p-4"
                                                    style={{
                                                        border: isActive
                                                            ? "1px solid #e7e5e0"
                                                            : ringColor
                                                              ? `1px solid ${ringColor}55`
                                                              : "1px solid #e7e5e0",
                                                        background: isActive
                                                            ? "#fff"
                                                            : ringColor
                                                              ? `linear-gradient(180deg,#fff 0%,${ringColor}0f 100%)`
                                                              : "#fff",
                                                    }}
                                                >
                                                    <div className="flex gap-3 items-start">
                                                        {/* 배지 */}
                                                        <div
                                                            className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
                                                            style={{
                                                                background: isActive
                                                                    ? "#f7f6f3"
                                                                    : medal
                                                                      ? `linear-gradient(135deg,#fff3c4,#fde68a)`
                                                                      : "#f7f6f3",
                                                                border: isActive
                                                                    ? "1px solid #e7e5e0"
                                                                    : ringColor
                                                                      ? `1.5px solid ${ringColor}`
                                                                      : "1px solid #e7e5e0",
                                                            }}
                                                        >
                                                            {isActive ? "⏳" : (medal ?? "🎖")}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-baseline gap-2">
                                                                <div className="text-sm font-extrabold text-stone-900 truncate">
                                                                    {season.label}
                                                                    {season.sub_label && (
                                                                        <span className="text-stone-400 font-semibold">
                                                                            {" "}· {season.sub_label}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {isActive ? (
                                                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">
                                                                        진행 중
                                                                    </span>
                                                                ) : record ? (
                                                                    <span
                                                                        className="text-sm font-extrabold shrink-0"
                                                                        style={{ color: ringColor ?? "#d97706" }}
                                                                    >
                                                                        {medal ?? ""} {record.rank}위
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <div className="text-xs text-stone-400 mb-2">
                                                                {season.range_start.slice(0, 10).replace(/-/g, ".")} ~{" "}
                                                                {isActive
                                                                    ? "진행 중"
                                                                    : season.range_end.slice(0, 10).replace(/-/g, ".")}
                                                            </div>
                                                            {record && (
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                                                        {record.level_name}
                                                                    </span>
                                                                    <span className="text-sm font-bold text-stone-900">
                                                                        {record.exp.toLocaleString()} EXP
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {sAwards.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-stone-100">
                                                            {sAwards.map((a) => (
                                                                <span
                                                                    key={a.id}
                                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                                                                    style={{
                                                                        background: "#fffbeb",
                                                                        border: "1px solid #fde9b8",
                                                                        color: "#92400e",
                                                                    }}
                                                                >
                                                                    <span className="text-xs">{a.icon}</span>
                                                                    {a.title}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 지난 업무 탭 */}
                    {tab === "history" && (
                        <div>
                            {isGuest ? (
                                <div className="text-center py-10 text-stone-400 text-sm">
                                    게스트 계정은 지난 업무를 조회할 수 없어요
                                </div>
                            ) : (
                                <>
                                    {/* 기간 필터 (목록 뷰에서만) */}
                                    {historyView === "list" && <div className="flex gap-2 mb-3 flex-wrap">
                                        {[
                                            { key: "week", label: "이번 주" },
                                            {
                                                key: "lastweek",
                                                label: "지난 주",
                                            },
                                            { key: "month", label: "이번 달" },
                                            {
                                                key: "custom",
                                                label: "직접 설정",
                                            },
                                        ].map((f) => (
                                            <button
                                                key={f.key}
                                                onClick={() => {
                                                    setHistoryFilter(
                                                        f.key as
                                                            | "week"
                                                            | "lastweek"
                                                            | "month"
                                                            | "custom",
                                                    );
                                                    if (f.key === "custom")
                                                        setShowDatePicker(
                                                            (p) => !p,
                                                        );
                                                    else
                                                        setShowDatePicker(
                                                            false,
                                                        );
                                                }}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                      ${
                          historyFilter === f.key
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-white text-stone-500 border-stone-200"
                      }`}
                                            >
                                                {f.key === "custom" &&
                                                dateRange?.from
                                                    ? `${dateRange.from.getMonth() + 1}/${dateRange.from.getDate()}${dateRange.to ? ` ~ ${dateRange.to.getMonth() + 1}/${dateRange.to.getDate()}` : ""}`
                                                    : f.label}
                                            </button>
                                        ))}
                                    </div>}

                                    {historyView === "list" && showDatePicker && (
                                        <div className="bg-white rounded-2xl border border-stone-200 mb-3 overflow-hidden shadow-lg">
                                            {/* 상단 선택 현황 */}
                                            <div className="grid grid-cols-2 divide-x divide-stone-100 border-b border-stone-100">
                                                <div
                                                    className={`px-4 py-3 ${!dateRange?.from ? "bg-amber-50" : ""}`}
                                                >
                                                    <p className="text-xs text-stone-400 mb-0.5">
                                                        시작일
                                                    </p>
                                                    <p
                                                        className={`text-sm font-bold ${dateRange?.from ? "text-stone-800" : "text-stone-300"}`}
                                                    >
                                                        {dateRange?.from
                                                            ? `${dateRange.from.getFullYear()}.${dateRange.from.getMonth() + 1}.${dateRange.from.getDate()}`
                                                            : "날짜 선택"}
                                                    </p>
                                                </div>
                                                <div
                                                    className={`px-4 py-3 ${dateRange?.from && !dateRange?.to ? "bg-amber-50" : ""}`}
                                                >
                                                    <p className="text-xs text-stone-400 mb-0.5">
                                                        종료일
                                                    </p>
                                                    <p
                                                        className={`text-sm font-bold ${dateRange?.to ? "text-stone-800" : "text-stone-300"}`}
                                                    >
                                                        {dateRange?.to
                                                            ? `${dateRange.to.getFullYear()}.${dateRange.to.getMonth() + 1}.${dateRange.to.getDate()}`
                                                            : "날짜 선택"}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* 달력 */}
                                            <div className="flex justify-center px-2 py-2">
                                                <DayPicker
                                                    mode="range"
                                                    selected={dateRange}
                                                    onSelect={(range) => {
                                                        setDateRange(range);
                                                    }}
                                                    locale={ko}
                                                    hideNavigation
                                                    components={{
                                                        MonthCaption:
                                                            DatePickerCaption,
                                                    }}
                                                    toDate={new Date()}
                                                />
                                            </div>

                                            {/* 하단 */}
                                            <div className="px-4 pb-4 flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        setDateRange(undefined);
                                                    }}
                                                    className="flex-1 py-2.5 text-xs border border-stone-200 rounded-xl text-stone-500 font-medium"
                                                >
                                                    초기화
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        setShowDatePicker(false)
                                                    }
                                                    className="flex-1 py-2.5 text-xs bg-amber-500 text-white rounded-xl font-medium"
                                                >
                                                    {dateRange?.from &&
                                                    dateRange?.to
                                                        ? "적용"
                                                        : "닫기"}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* 프로젝트/상태 필터 (목록 뷰에서만) */}
                                    {historyView === "list" && <div className="flex gap-2 mb-3">
                                        <div className="flex-1 min-w-0">
                                            <Select
                                                options={[
                                                    ...new Set(
                                                        tasks
                                                            .map((t) => t.proj)
                                                            .filter(Boolean),
                                                    ),
                                                ].map((p) => ({
                                                    value: p,
                                                    label: p,
                                                }))}
                                                value={
                                                    historyProjFilter
                                                        ? {
                                                              value: historyProjFilter,
                                                              label: historyProjFilter,
                                                          }
                                                        : null
                                                }
                                                onChange={(opt) =>
                                                    setHistoryProjFilter(
                                                        opt?.value ?? "",
                                                    )
                                                }
                                                placeholder="전체 프로젝트"
                                                isClearable
                                                isSearchable
                                                styles={
                                                    taskFilterProjectSelectStyles
                                                }
                                                menuPortalTarget={
                                                    typeof document !==
                                                    "undefined"
                                                        ? document.body
                                                        : null
                                                }
                                                noOptionsMessage={() =>
                                                    "프로젝트가 없어요"
                                                }
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <Select
                                                options={[
                                                    "대기",
                                                    "시작 전",
                                                    "진행중",
                                                    "지연/보류",
                                                    "완료",
                                                ].map((s) => ({
                                                    value: s,
                                                    label: s,
                                                }))}
                                                value={
                                                    historyStatusFilter
                                                        ? {
                                                              value: historyStatusFilter,
                                                              label: historyStatusFilter,
                                                          }
                                                        : null
                                                }
                                                onChange={(opt) =>
                                                    setHistoryStatusFilter(
                                                        opt?.value ?? "",
                                                    )
                                                }
                                                placeholder="전체 상태"
                                                isClearable
                                                isSearchable={false}
                                                styles={
                                                    taskFilterProjectSelectStyles
                                                }
                                                menuPortalTarget={
                                                    typeof document !==
                                                    "undefined"
                                                        ? document.body
                                                        : null
                                                }
                                            />
                                        </div>
                                    </div>}

                                    {/* 통계 (목록 뷰에서만) */}
                                    {historyView === "list" &&
                                    <div className="grid grid-cols-3 gap-2 mb-3">
                                        {[
                                            {
                                                n: historyTasks.length,
                                                l: "전체",
                                            },
                                            {
                                                n: historyTasks.filter(
                                                    (t) => t.status === "완료",
                                                ).length,
                                                l: "완료",
                                                green: true,
                                            },
                                            {
                                                n: historyTasks
                                                    .filter((t) => !t.is_plan)
                                                    .reduce(
                                                        (s, t) =>
                                                            s + (t.workload || 0),
                                                        0,
                                                    ),
                                                l: "총 공수",
                                                amber: true,
                                                fmt: true,
                                            },
                                        ].map((s) => (
                                            <div
                                                key={s.l}
                                                className="bg-white rounded-xl border border-stone-200 p-3 text-center"
                                            >
                                                <div
                                                    className={`text-lg font-bold ${s.green ? "text-green-600" : s.amber ? "text-amber-600" : "text-stone-800"}`}
                                                >
                                                    {s.fmt
                                                        ? formatWorkload(s.n) ||
                                                          "-"
                                                        : s.n}
                                                </div>
                                                <div className="text-xs text-stone-400 mt-0.5">
                                                    {s.l}
                                                </div>
                                            </div>
                                        ))}
                                    </div>}

                                    {historyTasks.length === 0 && historyView === "list" ? (
                                        <div className="text-center py-12 text-stone-400 text-sm">
                                            <div className="text-4xl mb-3">
                                                📂
                                            </div>
                                            <p>해당 기간에 업무가 없어요</p>
                                            <p className="text-xs mt-1 text-stone-300">
                                                개인 데이터 조회 — 팀 전체는
                                                리포트에서 확인
                                            </p>
                                        </div>
                                    ) : historyView === "effort" ? (
                                        <div>
                                            {/* 공수 달력 */}
                                            {(() => {
                                                // 달력 월 기준 전체 업무 (기간 필터 무관)
                                                const calMonthStart = `${effortCalMonth.getFullYear()}-${String(effortCalMonth.getMonth() + 1).padStart(2, "0")}-01`;
                                                const calMonthLastDay = new Date(effortCalMonth.getFullYear(), effortCalMonth.getMonth() + 1, 0).getDate();
                                                const calMonthEnd = `${effortCalMonth.getFullYear()}-${String(effortCalMonth.getMonth() + 1).padStart(2, "0")}-${String(calMonthLastDay).padStart(2, "0")}`;
                                                const myTasks = tasks.filter(
                                                    (t) => t.member === member && taskOverlapsYmd(t, calMonthStart, calMonthEnd),
                                                );
                                                const calTasks = effortCalProj
                                                    ? myTasks.filter((t) => t.proj === effortCalProj)
                                                    : myTasks;
                                                // 날짜별 공수/업무 존재 맵 — content_items 개별 일정 반영
                                                const dayWorkload = new Map<string, number>();
                                                const dayHasTasks = new Set<string>();

                                                function addRange(s: string, e: string, wl: number) {
                                                    const startD = new Date(s + "T00:00:00");
                                                    const endD = new Date(e + "T00:00:00");
                                                    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
                                                        const key = toLocalYmd(d);
                                                        dayHasTasks.add(key);
                                                        if (wl > 0) dayWorkload.set(key, (dayWorkload.get(key) ?? 0) + wl);
                                                    }
                                                }

                                                for (const t of calTasks) {
                                                    const items = t.content_items && t.content_items.length > 0 ? t.content_items : null;
                                                    if (items) {
                                                        // content_items: 개별 일정 있는 항목은 개별로
                                                        let fallbackWl = 0;
                                                        for (const ci of items) {
                                                            const cs = ci.start_date || ci.end_date;
                                                            const ce = ci.end_date || ci.start_date;
                                                            if (cs && ce) {
                                                                addRange(cs, ce, ci.workload || 0);
                                                            } else {
                                                                // 개별 일정 없는 항목 공수는 Task 일정으로 폴백
                                                                fallbackWl += ci.workload || 0;
                                                            }
                                                        }
                                                        if (fallbackWl > 0) {
                                                            const s = t.start_date || t.end_date;
                                                            const e = t.end_date || t.start_date;
                                                            if (s && e) addRange(s, e, fallbackWl);
                                                        }
                                                    } else {
                                                        // 기존 Task 단위
                                                        const s = t.start_date || t.end_date;
                                                        const e = t.end_date || t.start_date;
                                                        if (s && e) addRange(s, e, t.workload || 0);
                                                    }
                                                }
                                                // 달력 그리드 생성
                                                const calYear = effortCalMonth.getFullYear();
                                                const calMonth = effortCalMonth.getMonth();
                                                const firstDay = new Date(calYear, calMonth, 1);
                                                const lastDay = new Date(calYear, calMonth + 1, 0);
                                                const startPad = firstDay.getDay(); // 0=일 ~ 6=토
                                                const totalDays = lastDay.getDate();
                                                const weeks: (number | null)[][] = [];
                                                let week: (number | null)[] = Array(startPad).fill(null);
                                                for (let d = 1; d <= totalDays; d++) {
                                                    week.push(d);
                                                    if (week.length === 7) { weeks.push(week); week = []; }
                                                }
                                                if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
                                                const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

                                                return (
                                                    <div className="bg-white rounded-xl border border-stone-200 mb-3 overflow-hidden">
                                                        {/* 프로젝트 셀렉트 */}
                                                        <div className="px-4 pt-3 pb-2">
                                                            <Select
                                                                options={[...new Set(tasks.filter((t) => t.member === member).map((t) => t.proj).filter(Boolean))]
                                                                    .sort((a, b) => a.localeCompare(b, "ko"))
                                                                    .map((p) => ({ value: p, label: p }))}
                                                                value={effortCalProj ? { value: effortCalProj, label: effortCalProj } : null}
                                                                onChange={(opt) => setEffortCalProj(opt?.value ?? "")}
                                                                placeholder="전체 프로젝트"
                                                                isClearable
                                                                isSearchable
                                                                styles={taskFilterProjectSelectStyles}
                                                                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                                                                noOptionsMessage={() => "프로젝트가 없어요"}
                                                            />
                                                        </div>
                                                        {/* 월 네비게이션 (연도/월 그리드 피커) */}
                                                        {(() => {
                                                            const years = Array.from({ length: 11 }, (_, i) => 2020 + i);
                                                            const monthNames = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
                                                            return (
                                                                <div className="relative flex items-center justify-between px-4 py-1.5">
                                                                    <button type="button" onClick={() => setEffortCalMonth(new Date(calYear, calMonth - 1, 1))} className="p-1 text-stone-400 hover:text-stone-700" aria-label="이전 달">
                                                                        <i className="ri-arrow-left-s-line text-base" aria-hidden />
                                                                    </button>
                                                                    <div className="flex items-center gap-0.5">
                                                                        <button type="button" onClick={() => setEffortCalPicker((v) => v === "year" ? null : "year")} className="px-1 text-sm font-bold text-stone-800 hover:text-amber-600">{calYear}년</button>
                                                                        <button type="button" onClick={() => setEffortCalPicker((v) => v === "month" ? null : "month")} className="px-1 text-sm font-bold text-stone-800 hover:text-amber-600">{calMonth + 1}월</button>
                                                                    </div>
                                                                    <button type="button" onClick={() => setEffortCalMonth(new Date(calYear, calMonth + 1, 1))} className="p-1 text-stone-400 hover:text-stone-700" aria-label="다음 달">
                                                                        <i className="ri-arrow-right-s-line text-base" aria-hidden />
                                                                    </button>
                                                                    {effortCalPicker === "year" && (
                                                                        <div className="absolute left-1/2 top-8 z-10 w-56 -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
                                                                            <div className="grid grid-cols-3 gap-1.5">
                                                                                {years.map((y) => (
                                                                                    <button key={y} type="button" onClick={() => { setEffortCalMonth(new Date(y, calMonth, 1)); setEffortCalPicker(null); }}
                                                                                        className={`rounded-lg py-1.5 text-xs font-medium transition-all ${y === calYear ? "bg-amber-500 text-white" : "text-stone-600 hover:bg-amber-50 hover:text-amber-700"}`}
                                                                                    >{y}</button>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {effortCalPicker === "month" && (
                                                                        <div className="absolute left-1/2 top-8 z-10 w-56 -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
                                                                            <div className="grid grid-cols-4 gap-1.5">
                                                                                {monthNames.map((mn, i) => (
                                                                                    <button key={mn} type="button" onClick={() => { setEffortCalMonth(new Date(calYear, i, 1)); setEffortCalPicker(null); }}
                                                                                        className={`rounded-lg py-1.5 text-xs font-medium transition-all ${i === calMonth ? "bg-amber-500 text-white" : "text-stone-600 hover:bg-amber-50 hover:text-amber-700"}`}
                                                                                    >{mn}</button>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                        {/* 달력 그리드 */}
                                                        <div className="px-3 pb-3">
                                                            <div className="grid grid-cols-7 text-center text-[10px] font-bold text-stone-400 mb-1">
                                                                {weekdays.map((wd) => (
                                                                    <span key={wd} className="py-1">{wd}</span>
                                                                ))}
                                                            </div>
                                                            {weeks.map((wk, wi) => (
                                                                <div key={wi} className="grid grid-cols-7 text-center">
                                                                    {wk.map((day, di) => {
                                                                        if (day === null) return <span key={di} className="min-h-[3.5rem]" />;
                                                                        const key = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                                                        const isWeekend = di === 0 || di === 6;
                                                                        const wl = dayWorkload.get(key);
                                                                        const hasTask = dayHasTasks.has(key);
                                                                        const isSelected = effortCalDay === key && !isWeekend;
                                                                        return (
                                                                            <button
                                                                                key={di}
                                                                                type="button"
                                                                                onClick={() => !isWeekend && setEffortCalDay(isSelected ? null : hasTask ? key : null)}
                                                                                className={`flex flex-col items-center justify-start py-1.5 min-h-[3.5rem] rounded-lg transition-colors ${isWeekend ? "cursor-default opacity-30" : isSelected ? "bg-amber-50 ring-1 ring-amber-400" : hasTask ? "hover:bg-stone-50 cursor-pointer" : "cursor-default"}`}
                                                                            >
                                                                                <span className={`text-xs font-medium ${di === 0 ? "text-red-400" : di === 6 ? "text-blue-400" : "text-stone-600"}`}>
                                                                                    {day}
                                                                                </span>
                                                                                {wl ? (
                                                                                    <span className="mt-1 rounded bg-amber-500 px-1 py-0.5 text-[11px] font-bold leading-tight text-white">
                                                                                        {formatWorkload(wl)}
                                                                                    </span>
                                                                                ) : hasTask ? (
                                                                                    <span className="mt-1.5 size-1.5 rounded-full bg-stone-300" />
                                                                                ) : null}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {/* 선택된 날짜의 업무 목록 */}
                                                        {effortCalDay && (() => {
                                                            const dayTasks = calTasks.filter((t) =>
                                                                taskOverlapsYmd(t, effortCalDay, effortCalDay),
                                                            );
                                                            if (!dayTasks.length) return null;
                                                            const [, m, d] = effortCalDay.split("-");
                                                            return (
                                                                <div className="border-t border-stone-200 px-4 py-3">
                                                                    <p className="text-xs font-bold text-stone-500 mb-2">{Number(m)}/{Number(d)} 업무</p>
                                                                    <div className="space-y-1">
                                                                        {dayTasks.map((t) => (
                                                                            <button
                                                                                key={t.id}
                                                                                type="button"
                                                                                onClick={() => canEditHistoryTask(t.member ?? "") && setHistoryEditTask(t)}
                                                                                className={`flex w-full items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${canEditHistoryTask(t.member ?? "") ? "hover:bg-stone-50 cursor-pointer" : "cursor-default"}`}
                                                                            >
                                                                                <div className="min-w-0 flex-1">
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        {t.type && (
                                                                                            <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${{
                                                                                                프로젝트: "bg-violet-100 text-violet-700",
                                                                                                유지보수: "bg-red-100 text-red-700",
                                                                                                고도화: "bg-green-100 text-green-700",
                                                                                                접근성: "bg-sky-100 text-sky-700",
                                                                                                업무지원: "bg-blue-100 text-blue-700",
                                                                                            }[t.type] || "bg-gray-100 text-gray-600"}`}>{t.type}</span>
                                                                                        )}
                                                                                        <p className="text-xs font-medium text-stone-700 truncate">{t.proj}</p>
                                                                                    </div>
                                                                                    {t.content && <p className="text-[11px] text-stone-400 mt-0.5">{t.content.split("\n")[0]}</p>}
                                                                                </div>
                                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${{
                                                                                        완료: "bg-green-100 text-green-700",
                                                                                        진행중: "bg-blue-100 text-blue-700",
                                                                                        "지연/보류": "bg-red-100 text-red-700",
                                                                                    }[normalizeStatus(t.status)] || "bg-gray-100 text-gray-600"}`}>{normalizeStatus(t.status)}</span>
                                                                                    {t.workload > 0 && (
                                                                                        <span className="text-[11px] font-medium text-amber-600">{formatWorkload(t.workload)}</span>
                                                                                    )}
                                                                                </div>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                );
                                            })()}

                                            {/* 월별 프로젝트 공수 테이블 (달력 월 기준) */}
                                            {(() => {
                                                const mStart = `${effortCalMonth.getFullYear()}-${String(effortCalMonth.getMonth() + 1).padStart(2, "0")}-01`;
                                                const mLastDay = new Date(effortCalMonth.getFullYear(), effortCalMonth.getMonth() + 1, 0).getDate();
                                                const mEnd = `${effortCalMonth.getFullYear()}-${String(effortCalMonth.getMonth() + 1).padStart(2, "0")}-${String(mLastDay).padStart(2, "0")}`;
                                                const monthTasks = tasks.filter(
                                                    (t) => t.member === member && taskOverlapsYmd(t, mStart, mEnd),
                                                );
                                                const monthEffort = (() => {
                                                    const map = new Map<string, { count: number; workload: number }>();
                                                    for (const t of monthTasks) {
                                                        const proj = t.proj || "(프로젝트 없음)";
                                                        const entry = map.get(proj) ?? { count: 0, workload: 0 };
                                                        entry.count += 1;
                                                        if (!t.is_plan) entry.workload += t.workload || 0;
                                                        map.set(proj, entry);
                                                    }
                                                    return [...map.entries()]
                                                        .map(([proj, { count, workload }]) => ({ proj, count, workload }))
                                                        .sort((a, b) => b.workload - a.workload);
                                                })();
                                                const mLabel = `${effortCalMonth.getFullYear()}년 ${effortCalMonth.getMonth() + 1}월`;
                                                return (
                                                    <>
                                                        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                                            <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-500">
                                                                <span>{mLabel} 프로젝트</span>
                                                                <span className="text-right w-10">건수</span>
                                                                <span className="text-right w-16">공수</span>
                                                            </div>
                                                            {monthEffort.length === 0 ? (
                                                                <p className="px-4 py-6 text-center text-xs text-stone-400">해당 월에 업무가 없어요</p>
                                                            ) : (
                                                                <>
                                                                    {monthEffort.map((row, i) => (
                                                                        <div key={row.proj} className={`grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 text-sm ${i < monthEffort.length - 1 ? "border-b border-stone-100" : ""}`}>
                                                                            <span className="text-stone-800 font-medium truncate">{row.proj}</span>
                                                                            <span className="text-stone-500 text-right tabular-nums w-10">{row.count}</span>
                                                                            <span className="text-amber-600 font-medium text-right tabular-nums w-16">{formatWorkload(row.workload) || "-"}</span>
                                                                        </div>
                                                                    ))}
                                                                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 bg-stone-50 border-t border-stone-200 text-sm font-bold">
                                                                        <span className="text-stone-600">합계</span>
                                                                        <span className="text-stone-600 text-right tabular-nums w-10">{monthEffort.reduce((s, r) => s + r.count, 0)}</span>
                                                                        <span className="text-amber-600 text-right tabular-nums w-16">{formatWorkload(monthEffort.reduce((s, r) => s + r.workload, 0)) || "-"}</span>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                        {monthEffort.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const header = `${mLabel} 프로젝트\t건수\t공수`;
                                                                    const rows = monthEffort.map((r) => `${r.proj}\t${r.count}\t${formatWorkload(r.workload) || "-"}`);
                                                                    const totalCount = monthEffort.reduce((s, r) => s + r.count, 0);
                                                                    const totalWorkload = monthEffort.reduce((s, r) => s + r.workload, 0);
                                                                    const total = `합계\t${totalCount}\t${formatWorkload(totalWorkload) || "-"}`;
                                                                    void navigator.clipboard.writeText([header, ...rows, total].join("\n")).then(
                                                                        () => showToastMsg("공수 요약이 복사되었어요"),
                                                                        () => showToastMsg("복사에 실패했어요"),
                                                                    );
                                                                }}
                                                                className="mt-3 w-full py-2.5 text-xs font-medium text-stone-500 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors"
                                                            >
                                                                전체 복사
                                                            </button>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    ) : (
                                        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                            {historyTasks.map((t, i) => (
                                                <div
                                                    key={t.id}
                                                    className={`px-4 py-3 ${i < historyTasks.length - 1 ? "border-b border-stone-100" : ""}`}
                                                >
                                                    <div className="flex justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                {t.type && (
                                                                    <span
                                                                        className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0
                                ${
                                    {
                                        프로젝트:
                                            "bg-violet-100 text-violet-700",
                                        유지보수: "bg-red-100 text-red-700",
                                        고도화: "bg-green-100 text-green-700",
                                        접근성: "bg-sky-100 text-sky-700",
                                        업무지원: "bg-blue-100 text-blue-700",
                                    }[t.type] || "bg-gray-100 text-gray-600"
                                }`}
                                                                    >
                                                                        {t.type}
                                                                    </span>
                                                                )}
                                                                <p
                                                                    className={`text-sm font-medium truncate
                              ${t.status === "완료" ? "line-through text-stone-400" : "text-stone-800"}`}
                                                                >
                                                                    {t.proj}
                                                                </p>
                                                            </div>
                                                            {t.content && (
                                                                <TaskContentList
                                                                    content={
                                                                        t.content
                                                                    }
                                                                    className={`text-xs leading-relaxed ${t.status === "완료" ? "text-stone-300 line-through" : "text-stone-400"}`}
                                                                />
                                                            )}
                                                            <div className="flex gap-2 text-xs text-stone-400 mt-0.5">
                                                                {t.workload >
                                                                    0 && (
                                                                    <span>
                                                                        {formatWorkload(
                                                                            t.workload,
                                                                        )}
                                                                    </span>
                                                                )}
                                                                {t.start_date &&
                                                                    t.end_date && (
                                                                        <span>
                                                                            {t.start_date
                                                                                .slice(
                                                                                    5,
                                                                                )
                                                                                .replace(
                                                                                    "-",
                                                                                    "/",
                                                                                )}{" "}
                                                                            ~{" "}
                                                                            {t.end_date
                                                                                .slice(
                                                                                    5,
                                                                                )
                                                                                .replace(
                                                                                    "-",
                                                                                    "/",
                                                                                )}
                                                                        </span>
                                                                    )}
                                                                {!t.start_date &&
                                                                    t.end_date && (
                                                                        <span>
                                                                            ~
                                                                            {t.end_date
                                                                                .slice(
                                                                                    5,
                                                                                )
                                                                                .replace(
                                                                                    "-",
                                                                                    "/",
                                                                                )}
                                                                        </span>
                                                                    )}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col justify-between gap-1.5 shrink-0">
                                                            <span
                                                                className={`text-xs px-2 py-0.5 rounded-lg font-medium text-center
                                                           
                                                                ${
                                                                    {
                                                                        완료: "bg-green-100 text-green-700",
                                                                        진행중: "bg-blue-100 text-blue-700",
                                                                        "지연/보류":
                                                                            "bg-red-100 text-red-700",
                                                                    }[
                                                                        normalizeStatus(
                                                                            t.status,
                                                                        )
                                                                    ] ||
                                                                    "bg-gray-100 text-gray-600"
                                                                }`}
                                                            >
                                                                {normalizeStatus(
                                                                    t.status,
                                                                )}
                                                            </span>
                                                            {canEditHistoryTask(
                                                                t.member ?? "",
                                                            ) && (
                                                                <div className="flex items-center gap-2">
                                                                    <Tooltip label="수정">
                                                                        <button
                                                                            type="button"
                                                                            aria-label="수정"
                                                                            className="text-base text-stone-400 hover:text-amber-600 font-medium whitespace-nowrap"
                                                                            onClick={() =>
                                                                                setHistoryEditTask(
                                                                                    t,
                                                                                )
                                                                            }
                                                                        >
                                                                            <i
                                                                                className="ri-edit-line"
                                                                                aria-hidden
                                                                            />
                                                                        </button>
                                                                    </Tooltip>
                                                                    <Tooltip label="삭제">
                                                                        <button
                                                                            type="button"
                                                                            aria-label="삭제"
                                                                            className="text-base text-stone-400 hover:text-red-500 whitespace-nowrap"
                                                                            onClick={() => {
                                                                                if (
                                                                                    typeof t.id ===
                                                                                    "number"
                                                                                ) {
                                                                                    void deleteHistoryTask(
                                                                                        t.id,
                                                                                    );
                                                                                }
                                                                            }}
                                                                        >
                                                                            <i
                                                                                className="ri-delete-bin-line"
                                                                                aria-hidden
                                                                            />
                                                                        </button>
                                                                    </Tooltip>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* 완료 퀘스트 탭 */}
                    {tab === "quests" && (
                        <div>
                            {isGuest ? (
                                <div className="py-10 text-center text-sm text-stone-400">
                                    게스트 계정은 퀘스트를 조회할 수 없어요
                                </div>
                            ) : completedQuests.length === 0 ? (
                                <div className="py-12 text-center">
                                    <div className="mb-3 text-4xl">🎯</div>
                                    <p className="text-sm text-stone-400">
                                        완료한 퀘스트가 없어요
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                                    {completedQuests.map((q, i) => {
                                        const plain = q.content.includes("<")
                                            ? q.content
                                                  .replace(/<[^>]+>/g, " ")
                                                  .replace(/\s+/g, " ")
                                                  .trim()
                                            : q.content;
                                        const firstLine =
                                            plain.split("\n")[0]?.trim() ??
                                            plain;
                                        const dateLabel = q.created_at
                                            ? new Date(
                                                  q.created_at,
                                              ).toLocaleDateString("ko-KR", {
                                                  month: "numeric",
                                                  day: "numeric",
                                              })
                                            : "";
                                        return (
                                            <div
                                                key={q.id}
                                                className={`flex items-center gap-3 px-4 py-3 ${i < completedQuests.length - 1 ? "border-b border-stone-100" : ""}`}
                                            >
                                                <span className="shrink-0 text-base leading-none">
                                                    ✨
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="break-words text-sm font-medium text-stone-700 line-through">
                                                        {firstLine}
                                                    </p>
                                                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                                        {q.proj && (
                                                            <span className="truncate text-xs text-stone-400">
                                                                {q.proj}
                                                            </span>
                                                        )}
                                                        {dateLabel && (
                                                            <span className="text-xs text-stone-300">
                                                                {dateLabel}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void undoCompletedQuest(
                                                            q.id,
                                                        )
                                                    }
                                                    className="shrink-0 whitespace-nowrap text-xs text-stone-300 transition-colors hover:text-amber-500"
                                                >
                                                    ↩ 되돌리기
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 칭호 탭 */}
                    {tab === "titles" && (
                        <div className="space-y-5">
                            {/* 시즌 수상 칭호 */}
                            {mySeasonTitles.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">
                                        시즌 수상 칭호
                                    </p>
                                    <div className="space-y-2">
                                        {mySeasonTitles.map(({ def, count }) => {
                                            const s = RARITY_STYLE[def.rarity];
                                            return (
                                                <div
                                                    key={def.id}
                                                    className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${s.border} ${s.bg}`}
                                                >
                                                    <span className="text-2xl">{def.icon}</span>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className={`text-sm font-bold ${s.text}`}>{def.name}</p>
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.badgeBg} ${s.badgeText}`}>
                                                                {RARITY_LABEL[def.rarity]}
                                                            </span>
                                                            {count > 1 && (
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-stone-200 text-stone-600">
                                                                    ×{count}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-stone-400 mt-0.5">{def.desc}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 업적 칭호 */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">
                                        업적 칭호
                                    </p>
                                    <span className="text-xs text-stone-400">
                                        {myAchievementTitles.length}/{ACHIEVEMENT_TITLES.length}
                                    </span>
                                </div>

                                {/* 획득한 업적 */}
                                {myAchievementTitles.length > 0 && (
                                    <div className="space-y-2 mb-3">
                                        {myAchievementTitles
                                            .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])
                                            .map((t) => {
                                                const s = RARITY_STYLE[t.rarity];
                                                return (
                                                    <div
                                                        key={t.id}
                                                        className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${s.border} ${s.bg}`}
                                                    >
                                                        <span className="text-2xl">{t.icon}</span>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <p className={`text-sm font-bold ${s.text}`}>{t.name}</p>
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.badgeBg} ${s.badgeText}`}>
                                                                    {RARITY_LABEL[t.rarity]}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-stone-400 mt-0.5">{t.desc}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}

                                {/* 미획득 업적 */}
                                <div className="space-y-2">
                                    {ACHIEVEMENT_TITLES.filter(
                                        (t) => !player || !t.condition?.(player),
                                    )
                                        .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])
                                        .map((t) => (
                                            <div
                                                key={t.id}
                                                className="bg-white rounded-xl border border-stone-200 px-4 py-3 flex items-center gap-3 opacity-45"
                                            >
                                                <span className="text-2xl">{t.icon}</span>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-medium text-stone-500">{t.name}</p>
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-stone-200 text-stone-500">
                                                            {RARITY_LABEL[t.rarity]}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-stone-400 mt-0.5">{t.desc}</p>
                                                </div>
                                                <span className="text-xs text-stone-300">🔒</span>
                                            </div>
                                        ))}
                                </div>
                            </div>

                            {/* 레벨 가이드 */}
                            <div>
                                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">
                                    레벨 가이드
                                </p>
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                    {LEVELS.map((lv, i) => {
                                        const isCurrentLv = player
                                            ? calcLevel(player.exp).level === lv.level
                                            : false;
                                        const isUnlocked = player
                                            ? player.exp >= lv.exp
                                            : false;
                                        return (
                                            <div
                                                key={lv.level}
                                                className={`flex items-center gap-3 px-4 py-3
                          ${i < LEVELS.length - 1 ? "border-b border-stone-100" : ""}
                          ${isCurrentLv ? "bg-amber-50" : ""}`}
                                            >
                                                <div
                                                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                          ${isUnlocked ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-400"}`}
                                                >
                                                    {lv.level}
                                                </div>
                                                <div className="flex-1">
                                                    <p
                                                        className={`text-sm font-medium ${isUnlocked ? "text-stone-800" : "text-stone-400"}`}
                                                    >
                                                        {lv.name}
                                                    </p>
                                                    <p className="text-xs text-stone-400">
                                                        {lv.exp.toLocaleString()} EXP
                                                        {i < LEVELS.length - 1 &&
                                                            ` ~ ${(LEVELS[i + 1].exp - 1).toLocaleString()} EXP`}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    {isCurrentLv && (
                                                        <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium">
                                                            현재
                                                        </span>
                                                    )}
                                                    {!isCurrentLv && isUnlocked && (
                                                        <span className="text-xs text-green-500">✓</span>
                                                    )}
                                                    {!isUnlocked && (
                                                        <span className="text-xs text-stone-300">🔒</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 토스트 */}
                {toast && (
                    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
                        {toast}
                    </div>
                )}
                <TaskEditModal
                    task={historyEditTask}
                    onClose={() => setHistoryEditTask(null)}
                    onSaved={loadAll}
                    onDelete={(id) => deleteHistoryTask(id)}
                />
            </div>
        </AuthGuard>
    );
}
