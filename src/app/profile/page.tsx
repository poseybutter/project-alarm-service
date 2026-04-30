"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const MEMBERS = ["조현석", "조정연", "이헌희", "이지은"];
const LEVELS = [
    { level: 1, name: "🌱 풋내기 모험가", exp: 0 },
    { level: 2, name: "🗡️ 수련 중인 검사", exp: 500 },
    { level: 3, name: "🛡️ 던전 탐험가", exp: 1500 },
    { level: 4, name: "✨ 이름난 용병", exp: 3000 },
    { level: 5, name: "🔥 보스 사냥꾼", exp: 7000 },
    { level: 6, name: "💎 아케인 리버 개척자", exp: 15000 },
    { level: 7, name: "🌟 메이플 월드의 전설", exp: 35000 },
    { level: 8, name: "👑 검은 마법사의 숙적", exp: 70000 },
];
const MEMBER_COLORS: Record<string, { bg: string; text: string }> = {
    조현석: { bg: "bg-purple-100", text: "text-purple-700" },
    조정연: { bg: "bg-green-100", text: "text-green-700" },
    이헌희: { bg: "bg-amber-100", text: "text-amber-700" },
    이지은: { bg: "bg-orange-100", text: "text-orange-700" },
};

function calcLevel(exp: number) {
    let lv = LEVELS[0];
    for (const l of LEVELS) {
        if (exp >= l.exp) lv = l;
        else break;
    }
    return lv;
}
function getNextLevel(exp: number) {
    return LEVELS.find((l) => l.exp > exp) || null;
}
function expBar(exp: number) {
    const lv = calcLevel(exp);
    const next = getNextLevel(exp);
    if (!next) return 100;
    return Math.round(((exp - lv.exp) / (next.exp - lv.exp)) * 100);
}

type Player = {
    id: number;
    name: string;
    exp: number;
    month_exp: number;
    level: number;
    icons: string[];
    attend_last: string | null;
    attend_streak: number;
};

export default function ProfilePage() {
    const [players, setPlayers] = useState<Player[]>([]);
    const [selected, setSelected] = useState("이지은");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPlayers();
    }, []);

    async function loadPlayers() {
        setLoading(true);
        const { data } = await supabase.from("players").select("*");
        setPlayers(data || []);
        setLoading(false);
    }

    const player = players.find((p) => p.name === selected);
    const lv = player ? calcLevel(player.exp) : LEVELS[0];
    const next = player ? getNextLevel(player.exp) : null;
    const pct = player ? expBar(player.exp) : 0;
    const today = new Date().toISOString().slice(0, 10);
    const attended = player?.attend_last === today;

    const BAR_COLORS = [
        "#4CAF50",
        "#2196F3",
        "#9C27B0",
        "#FF5722",
        "#FF9800",
        "#F44336",
        "#FFD700",
        "#FF69B4",
    ];
    const barColor =
        BAR_COLORS[Math.min((lv.level || 1) - 1, BAR_COLORS.length - 1)];

    return (
        <div className="min-h-screen bg-stone-50">
            {/* 헤더 */}
            <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                <div className="max-w-2xl mx-auto">
                    <h1 className="text-base font-bold text-stone-800">
                        캐릭터 프로필
                    </h1>
                    <p className="text-xs text-stone-400 mt-0.5">메이플 월드</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 pt-4">
                {/* 팀원 선택 */}
                <div className="flex gap-2 mb-4">
                    {MEMBERS.map((m) => {
                        const c = MEMBER_COLORS[m];
                        return (
                            <button
                                key={m}
                                onClick={() => setSelected(m)}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all
                  ${
                      selected === m
                          ? `${c.bg} ${c.text} border-transparent`
                          : "bg-white text-stone-400 border-stone-200"
                  }`}
                            >
                                {m}
                            </button>
                        );
                    })}
                </div>

                {loading ? (
                    <div className="text-center py-16 text-stone-400 text-sm">
                        불러오는 중...
                    </div>
                ) : !player ? (
                    <div className="text-center py-16 text-stone-400 text-sm">
                        데이터가 없어요
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-stone-200 p-5">
                        {/* 상단 프로필 */}
                        <div className="flex items-center gap-4 mb-5">
                            <div
                                className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${MEMBER_COLORS[selected].bg} ${MEMBER_COLORS[selected].text} shrink-0`}
                            >
                                {selected.slice(1)}
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold text-stone-800">
                                    {selected}
                                </h2>
                                <p className="text-xs text-stone-500 mt-0.5">
                                    {lv.name} · Lv.{lv.level}
                                </p>
                                <span
                                    className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block
                  ${attended ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"}`}
                                >
                                    {attended
                                        ? "☀️ 오늘 출석 완료"
                                        : "💤 오늘 미출석"}
                                </span>
                            </div>
                        </div>

                        {/* 스탯 */}
                        <div className="grid grid-cols-3 gap-2 mb-5">
                            {[
                                {
                                    label: "누적 EXP",
                                    value: player.exp.toLocaleString(),
                                },
                                {
                                    label: "이번 달",
                                    value: player.month_exp.toLocaleString(),
                                },
                                {
                                    label: "연속 출석",
                                    value: player.attend_streak + "일",
                                },
                            ].map((s) => (
                                <div
                                    key={s.label}
                                    className="bg-stone-50 rounded-xl p-3 text-center"
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

                        {/* EXP 바 */}
                        <div className="mb-5">
                            <div className="flex justify-between text-xs text-stone-400 mb-1.5">
                                <span>다음 전직까지</span>
                                <span>{pct}%</span>
                            </div>
                            <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                        width: `${pct}%`,
                                        background: barColor,
                                    }}
                                />
                            </div>
                            <p className="text-xs text-stone-400 text-right mt-1">
                                {next
                                    ? `${next.exp.toLocaleString()} EXP에서 전직 (${(next.exp - player.exp).toLocaleString()} 남음)`
                                    : "🌟 최고 레벨 달성!"}
                            </p>
                        </div>

                        {/* 칭호 */}
                        <div>
                            <p className="text-xs font-medium text-stone-400 mb-2">
                                🏅 보유 칭호
                            </p>
                            {player.icons && player.icons.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {player.icons.map((icon, i) => (
                                        <span
                                            key={i}
                                            className="text-xs px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200 font-medium"
                                        >
                                            {icon}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-stone-400">
                                    아직 칭호가 없어요 — 퀘스트를
                                    클리어해보세요!
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* 랭킹 */}
                <div className="mt-4 mb-4">
                    <h3 className="text-sm font-bold text-stone-600 mb-2 px-1">
                        🏆 이번 달 랭킹
                    </h3>
                    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                        {[...players]
                            .sort((a, b) => b.month_exp - a.month_exp)
                            .map((p, i) => {
                                const medals = ["🥇", "🥈", "🥉", "🏅"];
                                const lv = calcLevel(p.exp);
                                return (
                                    <div
                                        key={p.name}
                                        className={`flex items-center gap-3 px-4 py-3
                      ${i < players.length - 1 ? "border-b border-stone-100" : ""}
                      ${p.name === selected ? "bg-amber-50" : ""}`}
                                    >
                                        <span className="text-lg">
                                            {medals[i] || "🏅"}
                                        </span>
                                        <div
                                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${MEMBER_COLORS[p.name]?.bg} ${MEMBER_COLORS[p.name]?.text}`}
                                        >
                                            {p.name.slice(1)}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-stone-800">
                                                {p.name}
                                            </p>
                                            <p className="text-xs text-stone-400">
                                                {lv.name}
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
            </div>
        </div>
    );
}
