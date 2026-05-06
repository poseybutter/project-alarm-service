"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
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
import Header from "@/components/Header";
import type { Quest, Player, Task } from "@/lib/types";
import { getDiff, formatWorkload } from "@/lib/utils";
import { BAR_COLORS, TYPE_COLORS, STATUS_COLORS } from "@/lib/constants";
import Avatar from "@/components/Avatar";
import { DayPicker } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";

type QuestFormType = { content: string; proj: string; end_date: string };

function QuestFormModal({
    title,
    questForm,
    setQuestForm,
    onSubmit,
    onClose,
}: {
    title: string;
    questForm: QuestFormType;
    setQuestForm: React.Dispatch<React.SetStateAction<QuestFormType>>;
    onSubmit: () => void;
    onClose: () => void;
}) {
    const [showDatePicker, setShowDatePicker] = useState(false);
    const toYmd = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const selectedDate = questForm.end_date
        ? new Date(`${questForm.end_date}T00:00:00`)
        : undefined;
    const dateLabel = selectedDate
        ? `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}`
        : "마감일 선택";

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-t-2xl p-5 w-full max-w-2xl"
                style={{ marginBottom: "67px" }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-base font-bold">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-2xl text-stone-400 leading-none"
                    >
                        ×
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                            퀘스트 내용
                        </label>
                        <textarea
                            className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
                            placeholder="예) 메인 슬라이드 퍼블리싱"
                            value={questForm.content}
                            onChange={(e) =>
                                setQuestForm({
                                    ...questForm,
                                    content: e.target.value,
                                })
                            }
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                            프로젝트 (선택)
                        </label>
                        <input
                            className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                            placeholder="예) 모바일앱 웹뷰"
                            value={questForm.proj}
                            onChange={(e) =>
                                setQuestForm({
                                    ...questForm,
                                    proj: e.target.value,
                                })
                            }
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                            마감일 (선택)
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowDatePicker((p) => !p)}
                            className={`w-full border rounded-lg px-3 py-2.5 text-sm text-left transition-all
                            ${showDatePicker ? "ring-2 ring-amber-200 border-amber-300" : "border-stone-200 hover:border-stone-300"}`}
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
                                                    setQuestForm({
                                                        ...questForm,
                                                        end_date: d
                                                            ? toYmd(d)
                                                            : "",
                                                    });
                                                }}
                                                locale={ko}
                                            />
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setQuestForm({
                                                        ...questForm,
                                                        end_date: "",
                                                    })
                                                }
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
                        onClick={onSubmit}
                        className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm"
                    >
                        {title === "퀘스트 추가" ? "추가하기" : "저장하기"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function HomePage() {
    const { member, loading: authLoading } = useAuth();
    const router = useRouter();

    const [player, setPlayer] = useState<Player | null>(null);
    const [quests, setQuests] = useState<Quest[]>([]);
    const [myTasks, setMyTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState("");
    const [showAddQuest, setShowAddQuest] = useState(false);
    const [showEditQuest, setShowEditQuest] = useState(false);
    const [editTarget, setEditTarget] = useState<Quest | null>(null);
    const [questForm, setQuestForm] = useState<QuestFormType>({
        content: "",
        proj: "",
        end_date: "",
    });

    useEffect(() => {
        if (!authLoading && !member) router.push("/login");
    }, [authLoading, member]);

    useEffect(() => {
        if (member) {
            loadData();

            // Realtime 구독
            const channel = supabase
                .channel("home-realtime")
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "quests" },
                    () => {
                        loadData();
                    },
                )
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "players" },
                    () => {
                        loadData();
                    },
                )
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "tasks" },
                    () => {
                        loadData();
                    },
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel).catch(console.error);
            };
        }
    }, [member]);

    if (authLoading || !member) return null;

    async function loadData() {
        setLoading(true);
        const [
            { data: playerData },
            { data: questData },
            { data: myTaskData },
        ] = await Promise.all([
            supabase.from("players").select("*").eq("name", member).single(),
            supabase
                .from("quests")
                .select("*")
                .eq("member", member)
                .neq("status", "완료")
                .order("end_date", { ascending: true }),
            supabase
                .from("tasks")
                .select("*")
                .eq("member", member)
                .neq("status", "완료")
                .order("end_date", { ascending: true }),
        ]);
        setPlayer(playerData);
        setQuests(questData || []);
        setMyTasks(myTaskData || []);
        setLoading(false);
    }

    function showToastMsg(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    }

    async function handleAttend() {
        if (!player || !member) return;
        const today = new Date().toISOString().slice(0, 10);
        if (player.attend_last === today) {
            showToastMsg("오늘은 이미 출석했어요!");
            return;
        }
        const result = await attendanceCheck(member);
        if (!result.success) {
            showToastMsg(result.message || "오류");
            return;
        }
        showToastMsg(
            result.levelUp
                ? `🎊 레벨업! ${result.newLv?.name}`
                : `☀️ 출석 완료! +${result.exp} EXP · ${result.streak}일 연속`,
        );
        loadData();
    }

    async function completeQuest(quest: Quest) {
        if (!member) return;
        await supabase
            .from("quests")
            .update({ status: "완료" })
            .eq("id", quest.id);
        const result = await awardExp(member, "QUEST");
        showToastMsg(
            result?.levelUp
                ? `🎊 레벨업! ${result.newLv?.name}`
                : `⚔️ 완료! +${result?.amount} EXP`,
        );
        loadData();
    }

    async function addQuest() {
        if (!questForm.content) return alert("퀘스트 내용은 필수예요");
        await supabase.from("quests").insert([
            {
                member: member,
                content: questForm.content,
                proj: questForm.proj || null,
                end_date: questForm.end_date || null,
                status: "대기",
            },
        ]);
        setShowAddQuest(false);
        setQuestForm({ content: "", proj: "", end_date: "" });
        loadData();
    }

    async function deleteQuest(id: number) {
        if (!confirm("삭제할까요?")) return;
        await supabase.from("quests").delete().eq("id", id);
        loadData();
    }

    function openEditQuest(quest: Quest) {
        setEditTarget(quest);
        setQuestForm({
            content: quest.content,
            proj: quest.proj || "",
            end_date: quest.end_date || "",
        });
        setShowEditQuest(true);
    }

    async function saveEditQuest() {
        if (!editTarget) return;
        await supabase
            .from("quests")
            .update({
                content: questForm.content,
                proj: questForm.proj || null,
                end_date: questForm.end_date || null,
            })
            .eq("id", editTarget.id);
        setShowEditQuest(false);
        setEditTarget(null);
        setQuestForm({ content: "", proj: "", end_date: "" });
        loadData();
    }

    async function updateTaskStatus(id: number, status: string, task: Task) {
        const prev = task.status;
        await supabase.from("tasks").update({ status }).eq("id", id);
        if (status === "완료" && prev !== "완료") {
            const type = task.priority === "긴급" ? "URGENT" : "COMPLETE";
            const isUrgent = task.priority === "긴급";
            const diff = getDiff(task.end_date);
            const isOnTime = diff !== null && diff >= 0;
            const result = await awardExp(
                task.member,
                type,
                true,
                isUrgent,
                isOnTime,
            );
            if (result?.levelUp)
                showToastMsg(`🎊 레벨업! ${result.newLv?.name}`);
        }
        if (prev === "완료" && status !== "완료") {
            const isUrgent = task.priority === "긴급";
            await awardExp(
                task.member,
                task.priority === "긴급" ? "URGENT" : "COMPLETE",
                false,
                isUrgent,
            );
        }
        loadData();
    }

    const lv = player ? calcLevel(player.exp) : LEVELS[0];
    const next = player ? getNextLevel(player.exp) : null;
    const pct = player ? expBar(player.exp) : 0;
    const today = new Date().toISOString().slice(0, 10);
    const attended = player?.attend_last === today;
    const barColor =
        BAR_COLORS[Math.min((lv.level || 1) - 1, BAR_COLORS.length - 1)];

    const urgentQuests = quests.filter((q) => {
        const d = getDiff(q.end_date);
        return d !== null && d <= 3;
    });

    const stats = {
        exp: player?.month_exp || 0,
    };

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f7f6f3]">
                <Header title="UD2팀 업무" />

                <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
                    {/* 프로필 카드 */}
                    <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-3">
                        <div className="flex items-center gap-3 mb-3">
                            <Avatar name={member} size={40} />
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-stone-900">
                                        {member}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                                        {lv.name}
                                    </span>
                                </div>
                                <button
                                    onClick={handleAttend}
                                    disabled={attended}
                                    className={`text-xs mt-1 px-2 py-0.5 rounded-full font-medium transition-all
                    ${attended ? "bg-green-100 text-green-700" : "bg-amber-500 text-white"}`}
                                >
                                    {attended ? "✅ 출석완료" : "☀️ 출석 체크"}
                                </button>
                            </div>
                            <div className="text-right text-xs text-stone-400">
                                <div>
                                    🔥 {player?.attend_streak || 0}일 연속
                                </div>
                                <div>이달 {stats.exp.toLocaleString()} EXP</div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs text-stone-400 mb-1">
                                <span>
                                    {player?.exp.toLocaleString() || 0} EXP
                                </span>
                                <span>
                                    다음 레벨까지{" "}
                                    {next
                                        ? (
                                              next.exp - (player?.exp || 0)
                                          ).toLocaleString()
                                        : 0}{" "}
                                    EXP
                                </span>
                            </div>
                            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${pct}%`,
                                        background: barColor,
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* 스탯 */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        {[
                            {
                                icon: "☀️",
                                label: "출석체크",
                                value: attended ? "완료" : "미완료",
                                onClick: handleAttend,
                                highlight: !attended,
                            },
                            {
                                icon: "📋",
                                label: "퀘스트",
                                value: quests.length,
                                onClick: null,
                                highlight: false,
                            },
                            {
                                icon: "📊",
                                label: "월 EXP",
                                value: stats.exp,
                                onClick: null,
                                highlight: false,
                            },
                        ].map((s) => (
                            <button
                                key={s.label}
                                onClick={s.onClick || undefined}
                                className={`rounded-xl border p-2.5 text-center transition-all
                  ${s.highlight ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-stone-200 text-stone-800"}`}
                            >
                                <div className="text-lg">{s.icon}</div>
                                <div className="text-sm font-bold mt-0.5">
                                    {s.value}
                                </div>
                                <div
                                    className={`text-xs mt-0.5 ${s.highlight ? "text-amber-100" : "text-stone-400"}`}
                                >
                                    {s.label}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* 오늘의 퀘스트 */}
                    <div className="mb-3">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">
                                오늘의 퀘스트
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-amber-600">
                                    완료 시 EXP 지급
                                </span>
                                <button
                                    onClick={() => setShowAddQuest(true)}
                                    className="text-xs bg-amber-500 text-white px-2.5 py-1 rounded-lg font-medium"
                                >
                                    + 추가
                                </button>
                            </div>
                        </div>

                        {quests.length === 0 ? (
                            <div className="bg-white rounded-xl border border-stone-200 py-10 text-center">
                                <p className="text-stone-400 text-sm">
                                    오늘 퀘스트가 없어요
                                </p>
                                <p className="text-xs text-stone-300 mt-1">
                                    + 추가 버튼으로 퀘스트를 만들어보세요!
                                </p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                {quests.map((q, i) => {
                                    const diff = getDiff(q.end_date);
                                    return (
                                        <div
                                            key={q.id}
                                            className={`flex items-center gap-3 px-4 py-3
                        ${i < quests.length - 1 ? "border-b border-stone-100" : ""}`}
                                        >
                                            <button
                                                onClick={() => completeQuest(q)}
                                                className="w-5 h-5 rounded-full border-2 border-stone-300 shrink-0 hover:border-amber-500 transition-colors"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-stone-800 truncate">
                                                    {q.content}
                                                </p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {q.proj && (
                                                        <span className="text-xs text-stone-400 truncate">
                                                            {q.proj}
                                                        </span>
                                                    )}
                                                    {q.end_date && (
                                                        <span
                                                            className={`text-xs font-medium ${diff !== null && diff <= 3 ? "text-red-500" : "text-stone-400"}`}
                                                        >
                                                            {q.end_date
                                                                .slice(5)
                                                                .replace(
                                                                    "-",
                                                                    "/",
                                                                )}
                                                            {diff !== null &&
                                                                ` D${diff < 0 ? "+" + Math.abs(diff) : "-" + diff}`}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className="text-xs text-green-600 font-medium">
                                                    +10 EXP
                                                </span>
                                                <button
                                                    onClick={() =>
                                                        openEditQuest(q)
                                                    }
                                                    className="text-xs text-stone-300 hover:text-amber-500 transition-colors"
                                                >
                                                    수정
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        deleteQuest(q.id)
                                                    }
                                                    className="text-xs text-stone-300 hover:text-red-400 transition-colors"
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {!loading &&
                        quests.length > 0 &&
                        urgentQuests.length === 0 && (
                            <div className="text-center py-6 text-stone-400 text-sm mb-3">
                                🎉 오늘 마감 퀘스트가 없어요!
                            </div>
                        )}

                    {/* 내 업무 */}
                    <div className="mb-3">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">
                                내 업무
                            </span>
                            <span className="text-xs text-stone-400">
                                {myTasks.length}건
                            </span>
                        </div>
                        {myTasks.length === 0 ? (
                            <div className="bg-white rounded-xl border border-stone-200 py-10 text-center">
                                <p className="text-stone-400 text-sm">
                                    진행 중인 업무가 없어요
                                </p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                {myTasks.map((t, i) => {
                                    const diff = getDiff(t.end_date);
                                    const ddayRed = diff !== null && diff <= 7;
                                    const ddayLabel =
                                        diff === null
                                            ? ""
                                            : diff < 0
                                              ? `D+${Math.abs(diff)}`
                                              : `D-${diff}`;
                                    return (
                                        <div
                                            key={t.id}
                                            className={`px-4 py-3 ${i < myTasks.length - 1 ? "border-b border-stone-100" : ""} ${t.priority === "긴급" ? "bg-amber-50" : ""}`}
                                        >
                                            <div className="flex items-start gap-2 mb-1.5">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {t.priority ===
                                                            "긴급" && (
                                                            <span
                                                                className="text-xs shrink-0"
                                                                title="긴급"
                                                            >
                                                                ⭐
                                                            </span>
                                                        )}
                                                        {t.type && (
                                                            <span
                                                                className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[t.type] || "bg-gray-100 text-gray-600"}`}
                                                            >
                                                                {t.type}
                                                            </span>
                                                        )}
                                                        <span className="text-sm font-medium text-stone-800 truncate">
                                                            {t.proj}
                                                        </span>
                                                    </div>
                                                    {t.content && (
                                                        <p className="text-xs text-stone-600 mt-1 break-words">
                                                            {t.content}
                                                        </p>
                                                    )}
                                                    {t.issue && (
                                                        <p className="text-xs text-amber-800 bg-amber-100/80 border border-amber-200 rounded-lg px-2 py-1 mt-1.5">
                                                            이슈: {t.issue}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-end justify-between gap-2 mt-1">
                                                <div className="text-xs text-stone-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                                                    {t.workload > 0 && (
                                                        <span>
                                                            {formatWorkload(
                                                                t.workload,
                                                            )}
                                                        </span>
                                                    )}
                                                    {t.start_date &&
                                                        t.end_date && (
                                                            <span
                                                                className={
                                                                    ddayRed
                                                                        ? "text-red-500 font-medium"
                                                                        : ""
                                                                }
                                                            >
                                                                {t.start_date
                                                                    .slice(5)
                                                                    .replace(
                                                                        "-",
                                                                        "/",
                                                                    )}{" "}
                                                                ~{" "}
                                                                {t.end_date
                                                                    .slice(5)
                                                                    .replace(
                                                                        "-",
                                                                        "/",
                                                                    )}
                                                                {ddayLabel &&
                                                                    ` · ${ddayLabel}`}
                                                            </span>
                                                        )}
                                                    {!t.start_date &&
                                                        t.end_date && (
                                                            <span
                                                                className={
                                                                    ddayRed
                                                                        ? "text-red-500 font-medium"
                                                                        : ""
                                                                }
                                                            >
                                                                ~
                                                                {t.end_date
                                                                    .slice(5)
                                                                    .replace(
                                                                        "-",
                                                                        "/",
                                                                    )}
                                                                {ddayLabel &&
                                                                    ` · ${ddayLabel}`}
                                                            </span>
                                                        )}
                                                    {t.workload === 0 &&
                                                        !t.start_date &&
                                                        !t.end_date && (
                                                            <span>
                                                                기간 미정
                                                            </span>
                                                        )}
                                                </div>
                                                <select
                                                    value={t.status}
                                                    onChange={(e) =>
                                                        updateTaskStatus(
                                                            t.id,
                                                            e.target.value,
                                                            t,
                                                        )
                                                    }
                                                    className={`text-xs px-2 py-1 rounded-lg font-medium border-0 cursor-pointer shrink-0 ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}
                                                >
                                                    {[
                                                        "대기",
                                                        "시작 전",
                                                        "진행중",
                                                        "이슈 및 대기",
                                                        "완료",
                                                    ].map((s) => (
                                                        <option
                                                            key={s}
                                                            value={s}
                                                        >
                                                            {s}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 마감 임박 */}
                    {urgentQuests.length > 0 && (
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">
                                    마감 임박
                                </span>
                                <span className="text-xs text-red-500 font-medium">
                                    {urgentQuests.length}건
                                </span>
                            </div>
                            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                {urgentQuests.map((q, i) => {
                                    const diff = getDiff(q.end_date);
                                    return (
                                        <div
                                            key={q.id}
                                            className={`flex items-center gap-3 px-4 py-3 ${i < urgentQuests.length - 1 ? "border-b border-stone-100" : ""}`}
                                        >
                                            <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-stone-800 truncate">
                                                    {q.content}
                                                </p>
                                                {q.proj && (
                                                    <p className="text-xs text-stone-400 truncate">
                                                        {q.proj}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="text-xs text-red-500 font-medium shrink-0">
                                                D
                                                {diff !== null && diff < 0
                                                    ? "+" + Math.abs(diff)
                                                    : "-" + diff}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* 퀘스트 추가 모달 */}
                {showAddQuest && (
                    <QuestFormModal
                        title="퀘스트 추가"
                        questForm={questForm}
                        setQuestForm={setQuestForm}
                        onSubmit={addQuest}
                        onClose={() => {
                            setShowAddQuest(false);
                            setQuestForm({
                                content: "",
                                proj: "",
                                end_date: "",
                            });
                        }}
                    />
                )}

                {/* 퀘스트 수정 모달 */}
                {showEditQuest && (
                    <QuestFormModal
                        title="퀘스트 수정"
                        questForm={questForm}
                        setQuestForm={setQuestForm}
                        onSubmit={saveEditQuest}
                        onClose={() => {
                            setShowEditQuest(false);
                            setEditTarget(null);
                            setQuestForm({
                                content: "",
                                proj: "",
                                end_date: "",
                            });
                        }}
                    />
                )}

                {/* 토스트 */}
                {toast && (
                    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
                        {toast}
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
