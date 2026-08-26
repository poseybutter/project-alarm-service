"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { calcLevel } from "@/features/gamification/maple";
import { getTeamRoster, type RosterEntry } from "@/features/gamification/api/getTeamRoster";
import type { Season } from "@/lib/types";

interface SeasonBannerProps {
    teamId: string | null;
    currentMember: string | null;
}

type BannerState = "A" | "D" | "B" | "C";

interface BannerConfig {
    bg: string;
    icon: string;
    title: string;
    sub: string;
}

/** KST 기준 오늘 자정 Date */
function kstToday(): Date {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return new Date(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
}

function getDaysUntil(dateStr: string): number {
    const [y, m, d] = dateStr.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    return Math.round((target.getTime() - kstToday().getTime()) / 86400000);
}

function getDaysSince(dateStr: string): number {
    return -getDaysUntil(dateStr);
}

export default function SeasonBanner({ teamId, currentMember }: SeasonBannerProps) {
    const router = useRouter();
    const [season, setSeason] = useState<Season | null>(null);
    const [topPlayer, setTopPlayer] = useState<RosterEntry | null>(null);
    const [myRank, setMyRank] = useState<number | null>(null);
    const [expGap, setExpGap] = useState<number | null>(null);

    async function load(isCancelled: () => boolean) {
        // 현재 진행 중인 시즌
        const { data: seasons } = await supabase
            .from("seasons")
            .select("*")
            .eq("team_id", teamId!)
            .order("range_end", { ascending: false })
            .limit(2);

        if (isCancelled()) return;
        if (!seasons || seasons.length === 0) return;

        const active = seasons.find((s) => s.status === "active") ?? null;
        const latestEnded = seasons.find((s) => s.status === "ended") ?? null;
        setSeason(active ?? latestEnded);

        // 팀 전체 플레이어 EXP 랭킹 (현재 EXP 기준)
        const players = await getTeamRoster(supabase, teamId!);

        if (isCancelled()) return;
        if (players.length === 0) return;

        setTopPlayer(players[0]);

        if (currentMember) {
            const myIdx = players.findIndex((p) => p.name === currentMember);
            if (myIdx >= 0) {
                setMyRank(myIdx + 1);
                setExpGap(players[0].exp - players[myIdx].exp);
            }
        }
    }

    useEffect(() => {
        // 팀 전환 시 이전 배너 초기화
        setSeason(null);
        setTopPlayer(null);
        setMyRank(null);
        setExpGap(null);

        if (!teamId) return;
        let cancelled = false;
        void load(() => cancelled);
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamId]);

    if (!season) return null;

    const daysUntilEnd = getDaysUntil(season.range_end);
    const daysSinceEnd = getDaysSince(season.range_end);
    const daysSinceStart = getDaysSince(season.range_start);

    let state: BannerState;
    if (season.status === "ended" || daysUntilEnd < 0) {
        state = "B";
    } else if (daysSinceStart <= 14) {
        state = "C";
    } else if (daysUntilEnd <= 3 && daysUntilEnd >= 0) {
        state = "D";
    } else {
        state = "A";
    }

    const topName = topPlayer?.name ?? "";
    const topLv = topPlayer ? calcLevel(topPlayer.exp) : null;

    const CONFIGS: Record<BannerState, BannerConfig> = {
        A: {
            bg: "#d97706",
            icon: "🏆",
            title: `${season.label} 종료 D-${daysUntilEnd}`,
            sub:
                myRank === 1
                    ? `현재 1위 · 끝까지 지켜내세요!`
                    : expGap !== null
                      ? `1위까지 -${expGap.toLocaleString()} EXP · 아직 한 발 남았다`
                      : `${topName} · ${topLv?.name ?? ""}`,
        },
        D: {
            bg: "#b45309",
            icon: "🏆",
            title: `아직 한 발 남았다 · D-${daysUntilEnd}`,
            sub:
                myRank === 1
                    ? `현재 1위 · 마지막까지!`
                    : expGap !== null
                      ? `1위까지 -${expGap.toLocaleString()} EXP`
                      : `${topName}이(가) 선두`,
        },
        B: {
            bg: "#ca8a04",
            icon: "👑",
            title: `${season.label} 종료 · ${daysSinceEnd <= 14 ? (season.mvp_member ?? topName) + " MVP" : "최종 결과"}`,
            sub: "명예의 전당에서 최종 결과 보기",
        },
        C: {
            bg: "#65a30d",
            icon: "🌱",
            title: `${season.label} 시작`,
            sub: "첫 업무를 완료하고 1위를 차지하세요",
        },
    };

    const cfg = CONFIGS[state];

    return (
        <button
            onClick={() => router.push("/hall-of-fame")}
            style={{
                background: cfg.bg,
                clipPath:
                    "polygon(0 0,100% 0,100% 100%,93.75% 80%,87.5% 100%,81.25% 80%,75% 100%,68.75% 80%,62.5% 100%,56.25% 80%,50% 100%,43.75% 80%,37.5% 100%,31.25% 80%,25% 100%,18.75% 80%,12.5% 100%,6.25% 80%,0% 100%)",
            }}
            className="relative w-full flex items-center gap-2.5 px-4 pt-3 pb-6 text-white text-left mb-3 transition-[filter] hover:brightness-90 active:brightness-90"
        >
            <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm shrink-0">
                {cfg.icon}
            </span>
            <span className="flex-1 min-w-0">
                {season.sub_label && (
                    <span className="block text-xs opacity-70 font-semibold uppercase tracking-wide truncate">
                        {season.sub_label}
                    </span>
                )}
                <span className="block text-base font-extrabold truncate">
                    {cfg.title}
                </span>
                <span className="block text-sm opacity-85 mt-0.5 truncate">
                    {cfg.sub}
                </span>
            </span>
            <span className="text-base opacity-85 shrink-0">›</span>
        </button>
    );
}
