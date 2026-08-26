"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { calcLevel } from "@/features/gamification/maple";
import { getTeamRoster } from "@/features/gamification/api/getTeamRoster";
import { useAuth } from "@/components/AuthProvider";
import AuthGuard from "@/components/AuthGuard";
import Avatar from "@/components/Avatar";
import { PageSpinner } from "@/components/Spinner";
import type { Season, SeasonRecord, SeasonAward } from "@/lib/types";

interface DisplayRecord {
    key: string;
    member: string;
    rank: number;
    exp: number;
    level_name: string;
}

interface SeasonData {
    season: Season;
    records: DisplayRecord[];
    awards: SeasonAward[];
    isLive: boolean;
}

const PODIUM_H: Record<number, number> = { 1: 96, 2: 66, 3: 44 };
const PODIUM_BG: Record<number, string> = {
    1: "linear-gradient(180deg,#fbbf24,#f59e0b)",
    2: "#d6d3d1",
    3: "#e7e5e0",
};

const FW_COLORS = ["#ef4444", "#f97316", "#fbbf24", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#f43f5e"];

// 모듈 레벨에서 한 번만 계산 (Math.random을 render 밖으로)
const FW_CONF = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: FW_COLORS[i % FW_COLORS.length],
    delay: Math.random() * 4.5,
    dur: Math.random() * 2.5 + 2,
    size: Math.random() * 7 + 4,
    rot: Math.random() * 720 - 360,
    drift: Math.random() * 100 - 50,
    repeatDelay: Math.random() * 2 + 0.5,
    isRect: i % 3 !== 0,
}));

const FW_BURSTS = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    x: [10, 28, 50, 68, 82, 93][i],
    y: [25, 15, 30, 18, 28, 12][i],
    delay: i * 0.6 + 0.3,
    repeatDelay: 3.5 + i * 0.3,
    colors: [FW_COLORS[i % FW_COLORS.length], FW_COLORS[(i + 2) % FW_COLORS.length]],
}));

function Fireworks() {
    const shouldReduce = useReducedMotion();
    if (shouldReduce) return null;

    const conf = FW_CONF;
    const bursts = FW_BURSTS;

    return (
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
            {/* 색종이 조각 */}
            {conf.map((c) => (
                <motion.div
                    key={c.id}
                    className={`absolute ${c.isRect ? "rounded-sm" : "rounded-full"}`}
                    style={{
                        left: `${c.x}%`,
                        top: "-4%",
                        width: c.size,
                        height: c.isRect ? c.size * 1.8 : c.size,
                        backgroundColor: c.color,
                        opacity: 0,
                    }}
                    animate={{
                        y: ["0vh", "108vh"],
                        opacity: [0, 0.95, 0.95, 0],
                        rotate: [0, c.rot],
                        x: [0, c.drift],
                    }}
                    transition={{
                        duration: c.dur,
                        delay: c.delay,
                        repeat: Infinity,
                        repeatDelay: c.repeatDelay,
                        ease: "linear",
                    }}
                />
            ))}

            {/* 폭죽 버스트 */}
            {bursts.flatMap((b) =>
                Array.from({ length: 10 }, (_, j) => {
                    const angle = (j / 10) * Math.PI * 2;
                    const dist = 45 + j * 3;
                    return (
                        <motion.div
                            key={`${b.id}-${j}`}
                            className="absolute rounded-full"
                            style={{
                                left: `${b.x}%`,
                                top: `${b.y}%`,
                                width: j % 2 === 0 ? 8 : 5,
                                height: j % 2 === 0 ? 8 : 5,
                                backgroundColor: b.colors[j % 2],
                            }}
                            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                            animate={{
                                x: [0, Math.cos(angle) * dist],
                                y: [0, Math.sin(angle) * dist],
                                opacity: [0, 1, 1, 0],
                                scale: [0, 1.4, 1, 0],
                            }}
                            transition={{
                                duration: 0.9,
                                delay: b.delay + j * 0.025,
                                repeat: Infinity,
                                repeatDelay: b.repeatDelay,
                                ease: "easeOut",
                            }}
                        />
                    );
                }),
            )}
        </div>
    );
}

export default function HallOfFamePage() {
    const router = useRouter();
    const { teamId } = useAuth();
    const [seasons, setSeasons] = useState<Season[]>([]);
    const [seasonDataMap, setSeasonDataMap] = useState<Record<number, SeasonData>>({});
    const [activeTab, setActiveTab] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    // seasonDataMap을 ref로도 관리해 useCallback deps 무한루프 방지
    const seasonDataRef = useRef<Record<number, SeasonData>>({});
    const seasonsRef = useRef<Season[]>([]);
    // teamId 변경마다 증가, stale 응답의 state 갱신 차단용
    const teamGenerationRef = useRef(0);

    const loadSeasonData = useCallback(async (
        seasonId: number,
        seasonList?: Season[],
        generation: number = teamGenerationRef.current,
    ) => {
        if (seasonDataRef.current[seasonId]) return;

        const list = seasonList ?? seasonsRef.current;
        const season = list.find((s) => s.id === seasonId);
        if (!season) return;

        const isLive = season.status === "active";

        if (isLive) {
            const [players, { data: awards }] = await Promise.all([
                getTeamRoster(supabase, teamId!),
                supabase
                    .from("season_awards")
                    .select("*")
                    .eq("season_id", seasonId),
            ]);
            if (generation !== teamGenerationRef.current) return;

            const records: DisplayRecord[] = players.map((p, i) => ({
                key: `live-${p.name}`,
                member: p.name,
                rank: i + 1,
                exp: p.exp,
                level_name: calcLevel(p.exp).name,
            }));

            const entry: SeasonData = { season, records, awards: (awards ?? []) as SeasonAward[], isLive: true };
            seasonDataRef.current = { ...seasonDataRef.current, [seasonId]: entry };
            setSeasonDataMap((prev) => ({ ...prev, [seasonId]: entry }));
        } else {
            const [{ data: records }, { data: awards }] = await Promise.all([
                supabase
                    .from("season_records")
                    .select("*")
                    .eq("season_id", seasonId)
                    .order("rank", { ascending: true }),
                supabase
                    .from("season_awards")
                    .select("*")
                    .eq("season_id", seasonId),
            ]);
            if (generation !== teamGenerationRef.current) return;

            const displayRecords: DisplayRecord[] = ((records ?? []) as SeasonRecord[]).map((r) => ({
                key: `rec-${r.id}`,
                member: r.member,
                rank: r.rank,
                exp: r.exp,
                level_name: r.level_name,
            }));

            const entry: SeasonData = {
                season,
                records: displayRecords,
                awards: (awards ?? []) as SeasonAward[],
                isLive: false,
            };
            seasonDataRef.current = { ...seasonDataRef.current, [seasonId]: entry };
            setSeasonDataMap((prev) => ({ ...prev, [seasonId]: entry }));
        }
    }, [teamId]);

    const loadSeasons = useCallback(async () => {
        const generation = ++teamGenerationRef.current;
        // 팀 전환 시 이전 팀 데이터 초기화
        setSeasons([]);
        setSeasonDataMap({});
        setActiveTab(null);
        seasonDataRef.current = {};
        seasonsRef.current = [];
        setLoading(true);
        try {
            const { data } = await supabase
                .from("seasons")
                .select("*")
                .eq("team_id", teamId!)
                .order("range_start", { ascending: false });
            if (generation !== teamGenerationRef.current) return;

            const list = (data ?? []) as Season[];
            seasonsRef.current = list;
            setSeasons(list);
            if (list.length > 0) {
                setActiveTab(list[0].id);
                await loadSeasonData(list[0].id, list, generation);
            }
        } finally {
            if (generation === teamGenerationRef.current) setLoading(false);
        }
    }, [teamId, loadSeasonData]);

    useEffect(() => {
        if (!teamId) return;
        void loadSeasons();
    }, [teamId, loadSeasons]);

    const handleTabChange = useCallback(async (seasonId: number) => {
        setActiveTab(seasonId);
        await loadSeasonData(seasonId);
    }, [loadSeasonData]);

    const currentData = activeTab ? seasonDataMap[activeTab] : null;
    const records = currentData?.records ?? [];
    const awards = currentData?.awards ?? [];
    const isLive = currentData?.isLive ?? false;
    const currentSeason = currentData?.season ?? null;

    // 포디움: 2위(좌) · 1위(중) · 3위(우)
    const podiumOrder = [records[1], records[0], records[2]];

    return (
        <AuthGuard>
            <div className="min-h-screen bg-white relative flex flex-col">
                {/* 폭죽 + 색종이 파티클 */}
                {records.length > 0 && <Fireworks />}

                {/* 헤더 */}
                <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                    <div className="max-w-2xl mx-auto flex items-center gap-3">
                        <button
                            onClick={() => router.back()}
                            className="w-7 h-7 rounded-full bg-[#f7f6f3] text-stone-500 flex items-center justify-center text-base hover:bg-stone-200 transition-colors shrink-0"
                            aria-label="뒤로 가기"
                        >
                            ←
                        </button>
                        <div className="text-base font-extrabold text-stone-900">
                            명예의 전당
                        </div>
                    </div>
                </div>

                {loading ? (
                    <PageSpinner />
                ) : seasons.length === 0 ? (
                    <div className="text-center py-20 text-stone-400 text-sm">
                        아직 시즌 기록이 없어요
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col w-full max-w-2xl mx-auto pb-[67px]">
                        {/* 시즌 탭 */}
                        <div className="flex gap-6 overflow-x-auto px-4 pt-3 pb-0 border-b border-stone-200 bg-white">
                            {seasons.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => void handleTabChange(s.id)}
                                    className="shrink-0 text-center pb-2.5 transition-colors"
                                    style={{
                                        borderBottom:
                                            activeTab === s.id
                                                ? "2.5px solid #d97706"
                                                : "2.5px solid transparent",
                                    }}
                                >
                                    <div
                                        className="text-sm font-bold"
                                        style={{ color: activeTab === s.id ? "#d97706" : "#78716c" }}
                                    >
                                        {s.label}
                                    </div>
                                    {s.sub_label && (
                                        <div className="text-[10px] text-stone-400 mt-0.5">
                                            {s.sub_label}
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab ?? "empty"}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                                className="flex-1 px-4 pt-4 flex flex-col gap-5 bg-white"
                            >
                                {/* 진행 중 배지 */}
                                {isLive && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex items-center gap-2"
                                    >
                                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                                            진행 중
                                        </span>
                                        <span className="text-xs text-stone-400">
                                            실시간 EXP 순위 · {currentSeason?.range_end?.replace(/-/g, ".") ?? ""} 종료
                                        </span>
                                    </motion.div>
                                )}

                                {/* 포디움 */}
                                {records.length > 0 ? (
                                    <div
                                        className="rounded-2xl px-3 pt-10 pb-0 overflow-hidden"
                                        style={{
                                            background:
                                                "linear-gradient(to bottom, #fef3c7 0%, #fffbeb 50%, transparent 100%)",
                                        }}
                                    >
                                        <div className="flex items-end justify-center gap-3">
                                            {podiumOrder.map((rec, i) => {
                                                if (!rec) return <div key={i} className="w-24" />;
                                                const rankPos = rec.rank;
                                                const isFirst = rankPos === 1;
                                                // 1위는 마지막에 등장, 더 높이 올라옴
                                                const delay = isFirst ? 0.4 : rankPos === 2 ? 0.1 : 0.25;
                                                const riseY = isFirst ? 60 : 40;
                                                return (
                                                    <motion.div
                                                        key={rec.key}
                                                        className="flex flex-col items-center"
                                                        style={{ width: 96 }}
                                                        initial={{ opacity: 0, y: riseY }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{
                                                            delay,
                                                            duration: 0.5,
                                                            ease: [0.34, 1.56, 0.64, 1], // spring-like
                                                        }}
                                                    >
                                                        <div className="relative mb-2">
                                                            {isFirst && (
                                                                <motion.span
                                                                    className="absolute -top-7 left-1/2 -translate-x-1/2 text-2xl"
                                                                    initial={{ y: -10, opacity: 0 }}
                                                                    animate={{ y: 0, opacity: 1 }}
                                                                    transition={{ delay: 0.85, duration: 0.4 }}
                                                                >
                                                                    <motion.span
                                                                        style={{ display: "inline-block" }}
                                                                        animate={{ rotate: [-8, 8, -8] }}
                                                                        transition={{
                                                                            delay: 1.1,
                                                                            duration: 1.2,
                                                                            repeat: Infinity,
                                                                            ease: "easeInOut",
                                                                        }}
                                                                    >
                                                                        👑
                                                                    </motion.span>
                                                                </motion.span>
                                                            )}
                                                            <Avatar
                                                                name={rec.member}
                                                                size={isFirst ? 52 : 40}
                                                            />
                                                        </div>
                                                        <div className="text-sm font-bold text-stone-900 truncate max-w-full text-center">
                                                            {rec.member}
                                                        </div>
                                                        <div className="text-[10px] text-stone-400 my-0.5 text-center truncate max-w-full">
                                                            {rec.level_name}
                                                        </div>
                                                        <motion.div
                                                            className="text-sm font-extrabold text-amber-600 mb-2 text-center"
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            transition={{ delay: delay + 0.3 }}
                                                        >
                                                            {rec.exp.toLocaleString()}
                                                        </motion.div>
                                                        {/* 포디움 블록 — 위에서 아래로 차오름 */}
                                                        <div className="w-full overflow-hidden rounded-t-lg">
                                                            <motion.div
                                                                className="w-full rounded-t-lg flex items-start justify-center pt-2"
                                                                style={{
                                                                    height: PODIUM_H[rankPos] ?? 44,
                                                                    background: PODIUM_BG[rankPos] ?? "#e7e5e0",
                                                                }}
                                                                initial={{ scaleY: 0, originY: 1 }}
                                                                animate={{ scaleY: 1 }}
                                                                transition={{
                                                                    delay,
                                                                    duration: 0.45,
                                                                    ease: "easeOut",
                                                                }}
                                                            >
                                                                <span
                                                                    className="text-xl font-extrabold"
                                                                    style={{
                                                                        color: rankPos === 1 ? "#92400e" : "#57534e",
                                                                    }}
                                                                >
                                                                    {rankPos}
                                                                </span>
                                                            </motion.div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-2xl border border-stone-200 py-12 text-center text-stone-400 text-sm">
                                        아직 기록이 없어요
                                    </div>
                                )}

                                {/* 특별상 */}
                                {awards.length > 0 && (
                                    <div>
                                        <div className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">
                                            이번 시즌 특별상
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {awards.map((a, i) => (
                                                <motion.div
                                                    key={a.id}
                                                    className="flex items-center gap-3 px-4 py-3 rounded-xl border"
                                                    style={{
                                                        background: "linear-gradient(135deg,#fffbeb 0%,#fff 60%)",
                                                        borderColor: "#fde9b8",
                                                    }}
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: 0.6 + i * 0.1, duration: 0.35 }}
                                                >
                                                    <span
                                                        className="text-2xl shrink-0"
                                                        style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,.08))" }}
                                                    >
                                                        {a.icon}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-bold text-stone-500 mb-0.5">
                                                            {a.title}
                                                        </div>
                                                        <div className="text-sm font-extrabold text-stone-900">
                                                            {a.member}
                                                            <span className="text-xs font-semibold text-stone-400 ml-1">
                                                                · {a.metric}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                                                        WINNER
                                                    </span>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 전체 순위 */}
                                {records.length > 0 && (
                                    <div>
                                        <div className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">
                                            전체 순위
                                        </div>
                                        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                            {records.map((r, i) => (
                                                <motion.div
                                                    key={r.key}
                                                    className="flex items-center gap-3 px-4 py-3"
                                                    style={{
                                                        background: i % 2 ? "#faf9f7" : "#fff",
                                                        borderBottom:
                                                            i < records.length - 1
                                                                ? "1px solid #f0ede8"
                                                                : "none",
                                                    }}
                                                    initial={{ opacity: 0, x: 16 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{
                                                        delay: 0.5 + i * 0.07,
                                                        duration: 0.3,
                                                    }}
                                                >
                                                    <span className="text-sm font-bold text-stone-400 w-5 shrink-0 text-center">
                                                        {r.rank}
                                                    </span>
                                                    <Avatar name={r.member} size={28} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-semibold text-stone-900 truncate">
                                                            {r.member}
                                                        </div>
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                                            {r.level_name}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm font-bold text-stone-900 shrink-0">
                                                        {r.exp.toLocaleString()}
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
