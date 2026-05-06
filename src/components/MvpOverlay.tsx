"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import Avatar from "@/components/Avatar";

type MvpOverlayProps = {
    show: boolean;
    mvpName: string;
    weekExp: number;
    taskCount: number;
    onClose: () => void;
};

const CONFETTI_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ffffff"];

export default function MvpOverlay({
    show,
    mvpName,
    weekExp,
    taskCount,
    onClose,
}: MvpOverlayProps) {
    useEffect(() => {
        if (!show || typeof window === "undefined") return;

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
            colors: CONFETTI_COLORS,
            scalar: 0.9,
        });
    }, [show]);

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    className="fixed inset-0 z-[101] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={onClose}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        className="mx-auto w-full max-w-sm cursor-pointer overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
                        initial={{ scale: 0.88, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.92, opacity: 0 }}
                        transition={{
                            type: "spring",
                            stiffness: 360,
                            damping: 24,
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        <div className="bg-gradient-to-r from-amber-500 via-emerald-500 to-sky-500 px-4 py-3 text-center">
                            <p className="text-base font-black tracking-tight text-white drop-shadow-sm sm:text-lg">
                                지난주 MVP 🏆
                            </p>
                        </div>
                        <div className="px-6 pb-6 pt-5 text-center">
                            <div className="mx-auto mb-3 flex justify-center">
                                <Avatar name={mvpName} size={72} />
                            </div>
                            <p className="text-xl font-bold text-stone-900 sm:text-2xl">
                                {mvpName}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-stone-600 sm:text-base">
                                완료 {taskCount}건 ·{" "}
                                {weekExp.toLocaleString()} EXP 획득
                            </p>
                            <p className="mt-4 text-sm font-medium text-emerald-700">
                                팀 전체가 응원해요! 🎉
                            </p>
                            <p className="mt-5 text-xs text-stone-400">
                                탭하여 닫기
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
