import type { ReactNode } from "react";

export type GameButtonVariant =
    | "primary"
    | "ghost"
    | "soft"
    | "danger"
    | "success";

export type GameButtonSize = "sm" | "md" | "lg";

type Props = {
    children: ReactNode;
    variant?: GameButtonVariant;
    size?: GameButtonSize;
    full?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    onClick?: () => void;
    className?: string;
};

const SIZES: Record<GameButtonSize, string> = {
    sm: "h-9 px-3 text-[12.5px]",
    md: "h-11 px-4 text-[14px]",
    lg: "h-12 px-5 text-[15px]",
};

const VARIANTS: Record<GameButtonVariant, string> = {
    primary:
        "bg-amber-400 hover:bg-amber-300 text-amber-950 border-amber-700 shadow-[0_4px_0_0_#b45309] active:shadow-[0_1px_0_0_#b45309]",
    ghost:
        "bg-white hover:bg-stone-50 text-stone-700 border-stone-300 shadow-[0_3px_0_0_#d6d3d1] active:shadow-[0_1px_0_0_#d6d3d1]",
    soft:
        "bg-stone-100 hover:bg-stone-50 text-stone-800 border-stone-300 shadow-[0_3px_0_0_#d6d3d1] active:shadow-[0_1px_0_0_#d6d3d1]",
    danger:
        "bg-red-100 hover:bg-red-50 text-red-800 border-red-400 shadow-[0_3px_0_0_#dc2626] active:shadow-[0_1px_0_0_#dc2626]",
    success:
        "bg-emerald-400 hover:bg-emerald-300 text-emerald-950 border-emerald-700 shadow-[0_3px_0_0_#047857] active:shadow-[0_1px_0_0_#047857]",
};

/** 3D 게임 버튼 — 하단 색 그림자 오프셋으로 입체감, active 시 translate. */
export function GameButton({
    children,
    variant = "primary",
    size = "md",
    full,
    leftIcon,
    rightIcon,
    disabled,
    type = "button",
    onClick,
    className,
}: Props) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center justify-center gap-2 font-extrabold rounded-lg border-2 transition-all
                active:translate-y-[3px] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                ${SIZES[size]} ${VARIANTS[variant]} ${full ? "w-full" : ""} ${className ?? ""}`}
        >
            {leftIcon}
            {children}
            {rightIcon}
        </button>
    );
}
