import type { Player } from "@/shared/types";

export type TitleCategory = "achievement" | "season_award";
export type TitleRarity = "common" | "rare" | "epic" | "legendary";

export interface TitleDef {
    id: string;
    icon: string;
    name: string;
    desc: string;
    category: TitleCategory;
    rarity: TitleRarity;
    /** achievement 타입만 사용 — 플레이어 stats 기반 실시간 판별 */
    condition?: (p: Player) => boolean;
}

export const ACHIEVEMENT_TITLES: TitleDef[] = [
    {
        id: "first",
        icon: "🌱",
        name: "첫 완료",
        desc: "첫 번째 업무 완료",
        category: "achievement",
        rarity: "common",
        condition: (p) => (p.total_done || 0) >= 1,
    },
    {
        id: "d10",
        icon: "💪",
        name: "업무 달인",
        desc: "완료 10건",
        category: "achievement",
        rarity: "common",
        condition: (p) => (p.total_done || 0) >= 10,
    },
    {
        id: "d30",
        icon: "🏆",
        name: "베테랑",
        desc: "완료 30건",
        category: "achievement",
        rarity: "rare",
        condition: (p) => (p.total_done || 0) >= 30,
    },
    {
        id: "d100",
        icon: "💎",
        name: "백전노장",
        desc: "완료 100건",
        category: "achievement",
        rarity: "epic",
        condition: (p) => (p.total_done || 0) >= 100,
    },
    {
        id: "streak3",
        icon: "🔥",
        name: "꾸준러",
        desc: "3일 연속 출석",
        category: "achievement",
        rarity: "common",
        condition: (p) => (p.attend_streak || 0) >= 3,
    },
    {
        id: "streak7",
        icon: "⚡",
        name: "주간 챔피언",
        desc: "7일 연속 출석",
        category: "achievement",
        rarity: "rare",
        condition: (p) => (p.attend_streak || 0) >= 7,
    },
    {
        id: "ontime",
        icon: "⏰",
        name: "마감지킴이",
        desc: "D-day 전 완료 5건",
        category: "achievement",
        rarity: "rare",
        condition: (p) => (p.on_time_done || 0) >= 5,
    },
    {
        id: "urgent",
        icon: "🚨",
        name: "긴급 해결사",
        desc: "긴급 업무 5건 완료",
        category: "achievement",
        rarity: "rare",
        condition: (p) => (p.urgent_done || 0) >= 5,
    },
    {
        id: "lv5",
        icon: "⭐",
        name: "중급 탐험가",
        desc: "레벨 5 달성",
        category: "achievement",
        rarity: "rare",
        condition: (p) => (p.level || 1) >= 5,
    },
    {
        id: "lv8",
        icon: "👑",
        name: "전설의 용사",
        desc: "최고 레벨(Lv.8) 달성",
        category: "achievement",
        rarity: "legendary",
        condition: (p) => (p.level || 1) >= 8,
    },
];

/** 시즌 종료 시 players.icons[] 에 ID 문자열로 누적 저장되는 칭호 */
export const SEASON_AWARD_TITLES: TitleDef[] = [
    {
        id: "season_mvp",
        icon: "👑",
        name: "시즌 MVP",
        desc: "시즌 EXP 1위",
        category: "season_award",
        rarity: "legendary",
    },
    {
        id: "season_top_done",
        icon: "🏆",
        name: "업무 완료왕",
        desc: "시즌 완료 건수 1위",
        category: "season_award",
        rarity: "epic",
    },
    {
        id: "season_urgent",
        icon: "⚡",
        name: "긴급 해결사",
        desc: "시즌 긴급 업무 1위",
        category: "season_award",
        rarity: "rare",
    },
    {
        id: "season_streak",
        icon: "📅",
        name: "꾸준왕",
        desc: "시즌 활동일 수 1위",
        category: "season_award",
        rarity: "rare",
    },
];

export const ALL_TITLES: TitleDef[] = [...ACHIEVEMENT_TITLES, ...SEASON_AWARD_TITLES];

export const TITLES_BY_ID = new Map<string, TitleDef>(
    ALL_TITLES.map((t) => [t.id, t]),
);

export const RARITY_ORDER: Record<TitleRarity, number> = {
    legendary: 0,
    epic: 1,
    rare: 2,
    common: 3,
};

export const RARITY_LABEL: Record<TitleRarity, string> = {
    legendary: "전설",
    epic: "에픽",
    rare: "레어",
    common: "일반",
};

export const RARITY_STYLE: Record<
    TitleRarity,
    { border: string; bg: string; text: string; badgeBg: string; badgeText: string }
> = {
    legendary: {
        border: "border-amber-400",
        bg: "bg-gradient-to-br from-amber-50 to-yellow-50",
        text: "text-amber-800",
        badgeBg: "bg-amber-400",
        badgeText: "text-white",
    },
    epic: {
        border: "border-purple-300",
        bg: "bg-gradient-to-br from-purple-50 to-violet-50",
        text: "text-purple-800",
        badgeBg: "bg-purple-500",
        badgeText: "text-white",
    },
    rare: {
        border: "border-blue-300",
        bg: "bg-blue-50",
        text: "text-blue-800",
        badgeBg: "bg-blue-500",
        badgeText: "text-white",
    },
    common: {
        border: "border-stone-200",
        bg: "bg-stone-50",
        text: "text-stone-700",
        badgeBg: "bg-stone-400",
        badgeText: "text-white",
    },
};

/** award.title 문자열 → season_award TitleDef id 매핑 */
export const AWARD_TITLE_TO_ID: Record<string, string> = {
    "업무 완료왕": "season_top_done",
    "긴급 해결사": "season_urgent",
    "꾸준왕": "season_streak",
};
