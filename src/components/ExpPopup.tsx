"use client";

import { motion } from "framer-motion";

export type ExpPopupType = "urgent" | "complete" | "quest" | "attend";

const TYPE_STYLE: Record<
    ExpPopupType,
    { fill: string; stroke: string; glow: string }
> = {
    urgent: {
        fill: "#fb923c",
        stroke: "#fff7ed",
        glow: "rgba(251, 146, 60, 0.5)",
    },
    complete: {
        fill: "#22c55e",
        stroke: "#f0fdf4",
        glow: "rgba(34, 197, 94, 0.45)",
    },
    quest: {
        fill: "#3b82f6",
        stroke: "#eff6ff",
        glow: "rgba(59, 130, 246, 0.45)",
    },
    attend: {
        fill: "#14b8a6",
        stroke: "#f0fdfa",
        glow: "rgba(20, 184, 166, 0.45)",
    },
};

type ExpPopupProps = {
    amount: number;
    x: number;
    y: number;
    type: ExpPopupType;
    onDone: () => void;
};

export default function ExpPopup({
    amount,
    x,
    y,
    type,
    onDone,
}: ExpPopupProps) {
    const s = TYPE_STYLE[type] ?? TYPE_STYLE.complete;

    return (
        <motion.div
            className="pointer-events-none fixed z-[99] text-base font-black tabular-nums sm:text-lg"
            style={{
                left: x,
                top: y,
                color: s.fill,
                textShadow: `
                    0 0 6px ${s.glow},
                    -2px -2px 0 ${s.stroke},
                    2px -2px 0 ${s.stroke},
                    -2px 2px 0 ${s.stroke},
                    2px 2px 0 ${s.stroke},
                    0 3px 0 rgba(0,0,0,0.15)
                `,
            }}
            initial={{ opacity: 1, scale: 0.75, x: "-50%", y: "-50%" }}
            animate={{
                opacity: 0,
                scale: 1.08,
                x: "-50%",
                y: "calc(-50% - 64px)",
            }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={onDone}
        >
            +{amount} EXP
        </motion.div>
    );
}
