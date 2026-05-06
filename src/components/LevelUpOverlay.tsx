"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

type LevelUpOverlayProps = {
    show: boolean;
    levelName: string;
    level: number;
    onClose: () => void;
};

/** 메이플 느낌의 밝은 팔레트 */
const CONFETTI_COLORS = [
    "#38bdf8",
    "#fbbf24",
    "#f472b6",
    "#a78bfa",
    "#4ade80",
    "#ffffff",
];

export default function LevelUpOverlay({
    show,
    levelName,
    level,
    onClose,
}: LevelUpOverlayProps) {
    useEffect(() => {
        if (!show || typeof window === "undefined") return;

        const timer = window.setTimeout(() => {
            onClose();
        }, 3000);

        confetti({
            particleCount: 100,
            spread: 75,
            origin: { x: 0, y: 0.55 },
            colors: CONFETTI_COLORS,
        });
        confetti({
            particleCount: 100,
            spread: 75,
            origin: { x: 1, y: 0.55 },
            colors: CONFETTI_COLORS,
        });
        confetti({
            particleCount: 40,
            spread: 100,
            origin: { x: 0.5, y: 0.35 },
            colors: ["#fde047", "#fef08a", "#ffffff"],
            scalar: 0.9,
        });

        return () => window.clearTimeout(timer);
    }, [show, onClose]);

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-b from-sky-300/50 via-fuchsia-200/40 to-amber-200/50 p-4 backdrop-blur-[2px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    onClick={onClose}
                >
                    {/* 빛 번짐 */}
                    <div
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.85)_0%,transparent_55%)]"
                        aria-hidden
                    />

                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        className="relative mx-auto w-full max-w-[min(22rem,calc(100vw-2rem))] cursor-pointer overflow-hidden rounded-3xl border-[3px] border-white shadow-[0_8px_0_rgb(180,83,9),0_16px_48px_rgba(251,191,36,0.45),0_0_0_1px_rgba(251,146,60,0.3)]"
                        initial={{ scale: 0.82, opacity: 0, y: 24 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.92, opacity: 0, y: 12 }}
                        transition={{ type: "spring", stiffness: 380, damping: 22 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        {/* 상단 타이틀 바 — 메이플 NPC 창 느낌 */}
                        <div className="relative bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 px-4 py-3 text-center shadow-[inset_0_-4px_0_rgba(0,0,0,0.12)]">
                            <span
                                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-lg opacity-90"
                                aria-hidden
                            >
                                ✨
                            </span>
                            <span
                                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-lg opacity-90"
                                aria-hidden
                            >
                                ✨
                            </span>
                            <p
                                className="text-lg font-black tracking-wide text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.25)] sm:text-xl"
                                style={{
                                    textShadow:
                                        "0 0 12px rgba(255,255,255,0.6), 0 2px 0 #1d4ed8",
                                }}
                            >
                                LEVEL UP! 🎊
                            </p>
                        </div>

                        {/* 본문 — 밝은 크림 패널 */}
                        <div className="bg-gradient-to-b from-amber-50 via-yellow-50/90 to-orange-50/95 px-6 pb-7 pt-5 text-center">
                            <p
                                className="select-none text-6xl font-black tabular-nums leading-none text-transparent sm:text-7xl"
                                style={{
                                    background:
                                        "linear-gradient(180deg, #fbbf24 0%, #ea580c 45%, #c2410c 100%)",
                                    WebkitBackgroundClip: "text",
                                    backgroundClip: "text",
                                    filter: "drop-shadow(0 3px 0 rgba(255,255,255,0.95)) drop-shadow(0 4px 0 rgba(180,83,9,0.35))",
                                }}
                            >
                                {level}
                            </p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700/80">
                                NEW LEVEL
                            </p>
                            <div className="mx-auto mt-4 max-w-[18rem] rounded-2xl border-2 border-amber-200/80 bg-white/90 px-4 py-3 shadow-inner shadow-amber-100/80">
                                <p className="text-base font-bold leading-snug text-emerald-800 sm:text-lg">
                                    {levelName}
                                </p>
                            </div>
                            <p className="mt-5 text-xs font-semibold text-amber-800/70">
                                화면을 탭하면 닫혀요
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
