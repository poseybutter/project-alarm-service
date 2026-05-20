import type { ReactNode } from "react";

/** 픽셀 다이아 + UD2 워크스페이스 로고 */
export function AuthLogo({
    size = 32,
    withText = true,
}: {
    size?: number;
    withText?: boolean;
}) {
    return (
        <div className="flex items-center gap-2.5">
            <div
                className="relative grid place-items-center"
                style={{ width: size, height: size }}
            >
                <div
                    className="absolute inset-0 border-2 border-amber-900 bg-amber-400"
                    style={{
                        clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
                        imageRendering: "pixelated",
                    }}
                />
                <span
                    className="relative font-black text-amber-950"
                    style={{
                        fontSize: size * 0.42,
                        letterSpacing: "-0.04em",
                    }}
                >
                    U
                </span>
            </div>
            {withText && (
                <div>
                    <div className="text-[15px] font-extrabold tracking-tight text-stone-900 leading-tight">
                        워크스페이스
                    </div>
                </div>
            )}
        </div>
    );
}

export type ChipTone =
    | "amber"
    | "blue"
    | "green"
    | "red"
    | "gray"
    | "gold";

const CHIP_TONES: Record<ChipTone, string> = {
    amber: "bg-amber-50 border-amber-400 text-amber-800",
    blue: "bg-blue-50 border-blue-400 text-blue-800",
    green: "bg-emerald-50 border-emerald-400 text-emerald-800",
    red: "bg-red-50 border-red-400 text-red-700",
    gray: "bg-stone-100 border-stone-300 text-stone-700",
    gold: "bg-yellow-50 border-yellow-500 text-yellow-800",
};

export function Chip({
    children,
    tone = "amber",
    icon,
}: {
    children: ReactNode;
    tone?: ChipTone;
    icon?: ReactNode;
}) {
    return (
        <span
            className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded border-2 ${CHIP_TONES[tone]} text-[11px] font-extrabold leading-snug`}
        >
            {icon}
            {children}
        </span>
    );
}

/** 캐릭터 박스 — 사각 아바타. 첫 글자만 표시 + 우측 하단 레벨 칩(optional). */
export function CharBox({
    name = "?",
    size = 48,
    color,
    level,
}: {
    name?: string;
    size?: number;
    color?: string;
    level?: number;
}) {
    const colors = [
        "#f59e0b",
        "#0ea5e9",
        "#10b981",
        "#ef4444",
        "#a78bfa",
        "#ec4899",
    ];
    const c = color || colors[name.charCodeAt(0) % colors.length];
    return (
        <div
            className="relative inline-block flex-shrink-0"
            style={{ width: size, height: size }}
        >
            <div
                className="absolute inset-0 rounded-md border-2 border-stone-800 bg-white"
                style={{ boxShadow: "inset 0 -3px 0 0 rgba(0,0,0,0.18)" }}
            >
                <div
                    className="absolute inset-[3px] rounded grid place-items-center text-white font-black"
                    style={{
                        background: `linear-gradient(180deg, ${c} 0%, ${c}dd 100%)`,
                        fontSize: size * 0.42,
                    }}
                >
                    {name.slice(0, 1)}
                </div>
            </div>
            {level != null && (
                <div
                    className="absolute -bottom-2 -right-2 grid place-items-center bg-amber-400 text-amber-950 border-2 border-amber-700 rounded text-[10px] font-black px-1 leading-none"
                    style={{
                        height: 17,
                        minWidth: 22,
                        boxShadow: "0 2px 0 0 #b45309",
                    }}
                >
                    {level}
                </div>
            )}
        </div>
    );
}

/** 작은 라인 아이콘 모음 */
export const Icons = {
    mail: (s = 16) => (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
        >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 7 9-7" />
        </svg>
    ),
    lock: (s = 16) => (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
        >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
    ),
    user: (s = 16) => (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
        >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
        </svg>
    ),
    eye: (s = 16) => (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
        >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    ),
    eyeOff: (s = 16) => (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
        >
            <path d="M10.6 6.2A10.6 10.6 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3.4 4M6.6 6.6A16 16 0 0 0 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.5-1" />
            <path d="m4 4 16 16" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    ),
    arrow: (s = 16) => (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
        >
            <path d="M5 12h14m-5-6 6 6-6 6" />
        </svg>
    ),
    check: (s = 16) => (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
        >
            <path d="m5 12 5 5 9-10" />
        </svg>
    ),
    x: (s = 16) => (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
        >
            <path d="M6 6l12 12M18 6 6 18" />
        </svg>
    ),
    search: (s = 16) => (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
        >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </svg>
    ),
};
