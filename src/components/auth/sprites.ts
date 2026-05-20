/**
 * 픽셀 스프라이트 정의 — design_handoff_auth_flow/v2/primitives.jsx에서 그대로 가져옴.
 * 각 맵은 1글자 = 1픽셀. 팔레트 객체의 키와 매핑.
 */

export type Palette = Record<string, string | null>;

export const PAL_AMBER: Palette = {
    ".": null,
    K: "#0c0a09",
    L: "#92400e",
    A: "#d97706",
    a: "#f59e0b",
    b: "#fbbf24",
    c: "#fde68a",
    W: "#ffffff",
    S: "#fed7aa",
};

export const PAL_RED: Palette = {
    ".": null,
    K: "#0c0a09",
    L: "#7f1d1d",
    A: "#b91c1c",
    a: "#ef4444",
    b: "#fca5a5",
    W: "#ffffff",
};

export const PAL_GREEN: Palette = {
    ".": null,
    K: "#0c0a09",
    L: "#065f46",
    A: "#059669",
    a: "#10b981",
    b: "#6ee7b7",
    W: "#ffffff",
};

export const PAL_BLUE: Palette = {
    ".": null,
    K: "#0c0a09",
    L: "#1e40af",
    A: "#2563eb",
    a: "#3b82f6",
    b: "#93c5fd",
    W: "#ffffff",
};

export const PAL_STONE: Palette = {
    ".": null,
    K: "#0c0a09",
    L: "#44403c",
    A: "#78716c",
    a: "#a8a29e",
    b: "#d6d3d1",
    W: "#ffffff",
};

/** 14x14 마스코트 — 모험가 길드원 */
export const SPR_HERO = [
    "....KKKKKK....",
    "...KaaaaaaK...",
    "..KaWAAAAWaK..",
    "..KaWAcWcAWa..",
    "..KaAcKWKcAaK.",
    "..KaAccccccAK.",
    "..KaAAcAAcAAK.",
    "...KaAAAAAK...",
    "....KKKKKK....",
    "...KaWWWWaK...",
    "..KaWAAAAWaK..",
    "..KaaAaaAaaK..",
    "...KaaaaaaK...",
    "....KKKKKK....",
];

/** 12x14 모래시계 */
export const SPR_HOURGLASS = [
    ".LLLLLLLLLL.",
    "LLLLLLLLLLLL",
    "LWaaaaaaaaWL",
    "LWAaaaaaaAWL",
    "LWAAaaaaAAWL",
    "LWAAAaaAAAWL",
    "LWWAAAAAAWWL",
    "LWWAAAAAAWWL",
    "LWAAAaaAAAWL",
    "LWAAaccaAAWL",
    "LWAaccccaAWL",
    "LWaaccccaaWL",
    "LLLLLLLLLLLL",
    ".LLLLLLLLLL.",
];

/** 16x10 열쇠 */
export const SPR_KEY = [
    "....KKKKK.......",
    "...KaaaaaK......",
    "..KaWKKKaaK.....",
    "..KaKbbbKaK.....",
    "..KaWKKKaaK.....",
    "...KaaaaaK......",
    "....KKaaK.......",
    ".....KaK.KKK.KK.",
    ".....KaK.KbK.KK.",
    ".....KKKKKKKKKK.",
];

/** 12x14 방패 */
export const SPR_SHIELD = [
    "KKKKKKKKKKKK",
    "KaaaaaaaaaaK",
    "KaWWAAAAWWaK",
    "KaWAcAAcAWaK",
    "KaAccAAccAaK",
    "KaAAAccAAAaK",
    "KaAAccccAAaK",
    "KaAAcAAcAAaK",
    "KaaAAAAAAaaK",
    ".KaaAAAAaaK.",
    "..KaaAAaaK..",
    "...KaaaaK...",
    "....KaaK....",
    ".....KK.....",
];

/** 14x10 두루마리 / 초대장 */
export const SPR_SCROLL = [
    "..KKKKKKKKKKKK",
    ".KAAAAAAAAAAAK",
    "KAcWWWWWWWWcAK",
    "KAcKKKWKKKKcAK",
    "KAcKKWKKKKWcAK",
    "KAcKWKKWKKKcAK",
    "KAcKKKWKKWKcAK",
    "KAcWWWWWWWWcAK",
    ".KAAAAAAAAAAAK",
    "..KKKKKKKKKKKK",
];

/** 8x8 보석 */
export const SPR_GEM = [
    "..AAAA..",
    ".AbbAAA.",
    "AbbbAAAA",
    "AbWbAAAa",
    "AbbbAaaA",
    ".AbbAAA.",
    "..AAAA..",
    "...AA...",
];
