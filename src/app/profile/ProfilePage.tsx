"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
    calcLevel,
    getNextLevel,
    expBar,
    attendanceCheck,
    LEVELS,
    awardExp,
} from "@/lib/maple";
import { useAuth } from "@/components/AuthProvider";
import AuthGuard from "@/components/AuthGuard";
import UserMenu from "@/components/UserMenu";
import NotificationButton from "@/components/NotificationButton";
import Avatar from "@/components/Avatar";
import TaskEditModal from "@/components/TaskEditModal";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { ko } from "date-fns/locale";
import type { Player, Task, Quest } from "@/lib/types";
import { formatWorkload } from "@/lib/utils";
import { BAR_COLORS, MEMBERS, MEMBER_COLORS } from "@/lib/constants";
import { toLocalYmd } from "@/lib/toLocalYmd";
import Select from "react-select";
import { taskFilterProjectSelectStyles } from "@/lib/reactSelectStyles";

const TITLES = [
    {
        id: "first",
        icon: "🌱",
        name: "첫 완료",
        desc: "첫 번째 업무 완료",
        condition: (p: Player) => (p.total_done || 0) >= 1,
    },
    {
        id: "streak3",
        icon: "🔥",
        name: "꾸준러",
        desc: "3일 연속 출석",
        condition: (p: Player) => (p.attend_streak || 0) >= 3,
    },
    {
        id: "streak7",
        icon: "⚡",
        name: "주간 챔피언",
        desc: "7일 연속 출석",
        condition: (p: Player) => (p.attend_streak || 0) >= 7,
    },
    {
        id: "ontime",
        icon: "⏰",
        name: "마감지킴이",
        desc: "D-day 전 완료 5건",
        condition: (p: Player) => (p.on_time_done || 0) >= 5,
    },
    {
        id: "d10",
        icon: "💪",
        name: "업무 달인",
        desc: "완료 10건",
        condition: (p: Player) => (p.total_done || 0) >= 10,
    },
    {
        id: "d30",
        icon: "🏆",
        name: "베테랑",
        desc: "완료 30건",
        condition: (p: Player) => (p.total_done || 0) >= 30,
    },
    {
        id: "urgent",
        icon: "🚨",
        name: "긴급 해결사",
        desc: "긴급 업무 5건 완료",
        condition: (p: Player) => (p.urgent_done || 0) >= 5,
    },
    {
        id: "lv5",
        icon: "⭐",
        name: "중급 탐험가",
        desc: "레벨 5 달성",
        condition: (p: Player) => (p.level || 1) >= 5,
    },
];

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

export default function ProfilePage() {
    const { member, refreshAvatar, role } = useAuth();
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
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showAvatarMenu, setShowAvatarMenu] = useState(false);
    const [historyEditTask, setHistoryEditTask] = useState<Task | null>(null);
    const [completedQuests, setCompletedQuests] = useState<Quest[]>([]);

    const canEditHistoryTask = (taskMember: string) =>
        !isGuest && (role === "admin" || taskMember === member);

    useEffect(() => {
        if (member) loadAll();
    }, [member]); // member 있을 때만 실행

    async function loadAll() {
        const [
            { data: playerData },
            { data: taskData },
            { data: teamTaskData },
            { data: completedQuestData },
        ] = await Promise.all([
            supabase.from("players").select("*"),
            supabase
                .from("tasks")
                .select("*")
                .eq("member", member)
                .order("created_at", { ascending: false }),
            supabase.from("tasks").select("*").in("member", MEMBERS),
            isGuest
                ? Promise.resolve({ data: [] as Quest[] })
                : supabase
                      .from("quests")
                      .select("*")
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
    }

    async function deleteHistoryTask(id: number) {
        if (!confirm("정말 삭제하시겠어요?")) return;
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
        await supabase
            .from("quests")
            .update({ status: "대기" })
            .eq("id", id);
        if (member) await awardExp(member, "QUEST", false); // -10 EXP
        await loadAll();
    }

    async function uploadAvatar(file: File) {
        if (!member) return;
        const ext = file.name.split(".").pop();
        const memberEn: Record<string, string> = {
            조현석: "hs",
            조정연: "jy",
            이헌희: "hh",
            이지은: "je",
        };
        const fileName = `${memberEn[member] || member}.${ext}`;

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
        const url = data.publicUrl + "?t=" + Date.now();

        await supabase
            .from("players")
            .update({ avatar_url: url })
            .eq("name", member);
        showToastMsg("프로필 이미지 업데이트 완료!");
        refreshAvatar();
        loadAll();
    }

    async function deleteAvatar() {
        if (!member) return;
        const memberEn: Record<string, string> = {
            조현석: "hs",
            조정연: "jy",
            이헌희: "hh",
            이지은: "je",
        };

        // Storage에서 파일 삭제 (확장자 모름 → 여러 형식 시도)
        const exts = ["jpg", "jpeg", "png", "webp", "gif"];
        const fileName = memberEn[member] || member;
        for (const ext of exts) {
            await supabase.storage
                .from("avatars")
                .remove([`${fileName}.${ext}`]);
        }

        // players 테이블 avatar_url 초기화
        await supabase
            .from("players")
            .update({ avatar_url: null })
            .eq("name", member);
        showToastMsg("프로필 이미지 삭제 완료!");
        refreshAvatar();
        loadAll();
    }

    async function handleAttend() {
        if (!member) return;
        const result = await attendanceCheck(member);
        if (!result.success) {
            showToastMsg(result.message || "오류");
            return;
        }
        showToastMsg(
            result.levelUp
                ? `🎊 레벨업! ${result.newLv?.name}`
                : `☀️ +${result.exp} EXP · ${result.streak}일 연속`,
        );
        loadAll();
    }

    const player = players.find((p) => p.name === member);
    const myPlayer = player;
    const myTitles = TITLES.filter((t) => myPlayer && t.condition(myPlayer));
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
            const d = new Date(t.created_at);
            if (d < start || d > end) return false;
            if (historyProjFilter && t.proj !== historyProjFilter) return false;
            if (historyStatusFilter && t.status !== historyStatusFilter)
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
                                    className="bg-white rounded-t-2xl w-full max-w-2xl overflow-hidden mb-[67px]"
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
                                        {myTitles.map((t) => (
                                            <div
                                                key={t.id}
                                                className="flex flex-col items-center gap-0.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5"
                                            >
                                                <span className="text-base">
                                                    {t.icon}
                                                </span>
                                                <span className="text-[11px] font-medium text-amber-700">
                                                    {t.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button
                                    onClick={handleAttend}
                                    disabled={attended}
                                    className={`block mx-auto text-xs px-4 py-1.5 rounded-full font-medium mb-4 transition-all
                ${attended ? "bg-green-100 text-green-700" : "bg-amber-500 text-white"}`}
                                >
                                    {attended ? "✅ 출석완료" : "☀️ 출석 체크"}
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
                                            const isLeader =
                                                p.name === "조현석";
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
                                    {MEMBERS.map((m) => {
                                        const mWL = weekTasks
                                            .filter((t) => t.member === m && !t.is_plan)
                                            .reduce(
                                                (s, t) => s + (t.workload || 0),
                                                0,
                                            );
                                        const mDone = weekTasks
                                            .filter(
                                                (t) =>
                                                    t.member === m &&
                                                    t.status === "완료" &&
                                                    !t.is_plan,
                                            )
                                            .reduce(
                                                (s, t) => s + (t.workload || 0),
                                                0,
                                            );
                                        const maxWL = Math.max(
                                            ...MEMBERS.map((mem) =>
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
                                        const c = MEMBER_COLORS[m];
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
                                                            opacity: 0.25,
                                                        }}
                                                    />
                                                    <div
                                                        className="absolute inset-y-0 left-0 rounded-full"
                                                        style={{
                                                            width: `${(mDone / maxWL) * 100}%`,
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
                                    {/* 기간 필터 */}
                                    <div className="flex gap-2 mb-3 flex-wrap">
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
                                    </div>

                                    {showDatePicker && (
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

                                    {/* 프로젝트/상태 필터 */}
                                    <div className="flex gap-2 mb-3">
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
                                                    "이슈 및 대기",
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
                                    </div>

                                    {/* 통계 */}
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
                                    </div>

                                    {historyTasks.length === 0 ? (
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
                                                                <p className="text-xs text-stone-400 truncate">
                                                                    {t.content}
                                                                </p>
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
                                                                        "이슈 및 대기":
                                                                            "bg-red-100 text-red-700",
                                                                    }[
                                                                        t.status
                                                                    ] ||
                                                                    "bg-gray-100 text-gray-600"
                                                                }`}
                                                            >
                                                                {t.status}
                                                            </span>
                                                            {canEditHistoryTask(
                                                                t.member ?? "",
                                                            ) && (
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        className="text-xs text-amber-600 hover:text-amber-700 font-medium whitespace-nowrap"
                                                                        onClick={() =>
                                                                            setHistoryEditTask(
                                                                                t,
                                                                            )
                                                                        }
                                                                    >
                                                                        수정
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="text-xs text-stone-400 hover:text-red-500 whitespace-nowrap"
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
                                                                        삭제
                                                                    </button>
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
                        <div className="space-y-4">
                            {/* 레벨 가이드 */}
                            <div>
                                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">
                                    레벨 가이드
                                </p>
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                    {LEVELS.map((lv, i) => {
                                        const isCurrentLv = player
                                            ? calcLevel(player.exp).level ===
                                              lv.level
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
                                                        {lv.exp.toLocaleString()}{" "}
                                                        EXP
                                                        {i <
                                                            LEVELS.length - 1 &&
                                                            ` ~ ${(LEVELS[i + 1].exp - 1).toLocaleString()} EXP`}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    {isCurrentLv && (
                                                        <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium">
                                                            현재
                                                        </span>
                                                    )}
                                                    {!isCurrentLv &&
                                                        isUnlocked && (
                                                            <span className="text-xs text-green-500">
                                                                ✓
                                                            </span>
                                                        )}
                                                    {!isUnlocked && (
                                                        <span className="text-xs text-stone-300">
                                                            🔒
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 획득한 칭호 */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">
                                        획득한 칭호
                                    </p>
                                    <span className="text-xs text-stone-400">
                                        {player
                                            ? TITLES.filter((t) =>
                                                  t.condition(player),
                                              ).length
                                            : 0}
                                        /{TITLES.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {player &&
                                    TITLES.filter((t) => t.condition(player))
                                        .length > 0 ? (
                                        TITLES.filter((t) =>
                                            t.condition(player),
                                        ).map((t) => (
                                            <div
                                                key={t.id}
                                                className="bg-white rounded-xl border border-stone-200 px-4 py-3 flex items-center gap-3"
                                            >
                                                <span className="text-2xl">
                                                    {t.icon}
                                                </span>
                                                <div>
                                                    <p className="text-sm font-bold text-stone-800">
                                                        {t.name}
                                                    </p>
                                                    <p className="text-xs text-stone-400">
                                                        {t.desc}
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs text-stone-400 text-center py-4">
                                            아직 획득한 칭호가 없어요
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* 미획득 칭호 */}
                            <div>
                                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">
                                    미획득
                                </p>
                                <div className="space-y-2">
                                    {TITLES.filter(
                                        (t) => !player || !t.condition(player),
                                    ).map((t) => (
                                        <div
                                            key={t.id}
                                            className="bg-white rounded-xl border border-stone-200 px-4 py-3 flex items-center gap-3 opacity-50"
                                        >
                                            <span className="text-2xl">
                                                {t.icon}
                                            </span>
                                            <div className="flex-1">
                                                <p className="text-sm font-medium text-stone-500">
                                                    {t.name}
                                                </p>
                                                <p className="text-xs text-stone-400">
                                                    {t.desc}
                                                </p>
                                            </div>
                                            <span className="text-xs text-stone-300">
                                                🔒
                                            </span>
                                        </div>
                                    ))}
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
                />
            </div>
        </AuthGuard>
    );
}
