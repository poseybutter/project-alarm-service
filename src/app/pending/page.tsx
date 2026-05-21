"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GameButton } from "@/components/auth/GameButton";
import { Hourglass, Gem } from "@/components/auth/Pix";
import {
    AuthLogo,
    CharBox,
    Chip,
    Icons,
} from "@/components/auth/atoms";

type MeResponse = {
    email?: string;
    name?: string;
    status?: "pending" | "active" | "rejected" | string;
};

function fmtElapsed(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(
        s % 60,
    ).padStart(2, "0")}`;
}

export default function PendingPage() {
    const router = useRouter();
    const [elapsed, setElapsed] = useState(0);
    const [sandFrame, setSandFrame] = useState(0);
    const [me, setMe] = useState<MeResponse | null>(null);

    // 시간 카운터
    useEffect(() => {
        const id = setInterval(() => setElapsed((e) => e + 1), 1000);
        const id2 = setInterval(
            () => setSandFrame((f) => (f + 1) % 4),
            700,
        );
        return () => {
            clearInterval(id);
            clearInterval(id2);
        };
    }, []);

    // /api/auth/me 폴링 — 최초 1회 + 15초 간격
    useEffect(() => {
        let cancelled = false;
        async function fetchMe() {
            try {
                const res = await fetch("/api/auth/me", {
                    cache: "no-store",
                });
                if (!res.ok) return;
                const data: MeResponse = await res.json();
                if (cancelled) return;
                setMe(data);
                if (data.status === "active") {
                    router.push("/");
                } else if (data.status === "rejected") {
                    router.push("/login?rejected=1");
                }
            } catch {
                // 네트워크 일시 오류는 다음 폴링에서 재시도
            }
        }
        void fetchMe();
        const id = setInterval(fetchMe, 15000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [router]);

    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
    }

    const userEmail = me?.email ?? "—";
    const userName = me?.name ?? "신청자";

    return (
        <div
            className="min-h-screen w-full bg-gradient-to-b from-amber-50/40 via-white to-stone-50 text-stone-900 flex flex-col relative"
            style={{
                fontFamily:
                    "'SUIT Variable', 'Pretendard Variable', system-ui, sans-serif",
            }}
        >
            <div
                className="absolute inset-0 opacity-30 pointer-events-none"
                style={{
                    backgroundImage:
                        "radial-gradient(circle at 1px 1px, #b45309 1px, transparent 0)",
                    backgroundSize: "20px 20px",
                    maskImage:
                        "radial-gradient(900px 700px at 50% 50%, #000, transparent 80%)",
                    WebkitMaskImage:
                        "radial-gradient(900px 700px at 50% 50%, #000, transparent 80%)",
                }}
            />

            <div className="relative h-16 px-10 flex items-center justify-between border-b-2 border-stone-200 bg-white/80 backdrop-blur">
                <AuthLogo size={28} />
                <div className="flex items-center gap-3">
                    <Chip tone="amber" icon="⏳">
                        승인 대기 중
                    </Chip>
                    <span className="text-[13px] text-stone-500 font-medium">
                        {userName} · {userEmail}
                    </span>
                    <GameButton
                        variant="ghost"
                        size="sm"
                        onClick={handleLogout}
                    >
                        로그아웃
                    </GameButton>
                </div>
            </div>

            <div className="relative flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-[720px]">
                    <div
                        className="bg-white border-2 border-stone-800 rounded-xl overflow-hidden"
                        style={{ boxShadow: "0 8px 0 0 #1c1917" }}
                    >
                        <div className="h-9 bg-amber-400 border-b-2 border-stone-800 grid place-items-center relative">
                            <div className="text-[11px] font-extrabold text-amber-950 tracking-widest font-mono-auth">
                                ★ GUARDIAN&apos;S GATE · 관문 ★
                            </div>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1.5">
                                <span className="w-2.5 h-2.5 bg-amber-700 border border-amber-900" />
                                <span className="w-2.5 h-2.5 bg-amber-700 border border-amber-900" />
                            </div>
                        </div>

                        <div className="p-10 text-center">
                            <div className="flex justify-center mb-5">
                                <div className="relative p-4 bg-amber-50 border-2 border-amber-300 rounded-lg auth-swing">
                                    <Hourglass scale={5} />
                                    <div
                                        className="absolute left-1/2 -translate-x-1/2 w-[6px] h-[6px] bg-amber-600 auth-sandfall"
                                        style={{
                                            top: `${50 + sandFrame * 3}%`,
                                        }}
                                    />
                                </div>
                            </div>

                            <h1 className="text-[28px] font-black tracking-tight leading-[1.15] text-stone-900">
                                관문 앞에서 대기 중…
                            </h1>
                            <p className="text-[14px] text-stone-500 mt-3 leading-relaxed max-w-[480px] mx-auto">
                                길드장이 신청서를 확인하고 있어요. 승인이
                                완료되면{" "}
                                <b className="text-stone-700">{userEmail}</b>
                                로 알림이 가요. 보통{" "}
                                <b className="text-amber-700">
                                    업무시간 내 1시간 이내
                                </b>
                                로 처리됩니다.
                            </p>

                            <div className="mt-8 grid grid-cols-[1fr_24px_1fr_24px_1fr] items-center">
                                {[
                                    {
                                        label: "신청서 제출",
                                        sub: "✓ 완료",
                                        state: "done" as const,
                                        emoji: "📜",
                                    },
                                    {
                                        label: "길드장 검토 중",
                                        sub: `⏳ ${fmtElapsed(elapsed)} 경과`,
                                        state: "now" as const,
                                        emoji: "🔍",
                                    },
                                    {
                                        label: "워크스페이스 입장",
                                        sub: "곧 만나요",
                                        state: "todo" as const,
                                        emoji: "🏰",
                                    },
                                ].map((s, i) => (
                                    <PendingStep
                                        key={s.label}
                                        step={s}
                                        connectorIndex={i}
                                    />
                                ))}
                            </div>

                            <div className="mt-8 p-4 rounded-lg bg-stone-50 border-2 border-stone-200 flex items-center gap-3 text-left">
                                <CharBox
                                    name="주"
                                    color="#f59e0b"
                                    size={44}
                                    level={12}
                                />
                                <div className="flex-1">
                                    <div className="text-[10px] text-stone-400 font-mono-auth font-extrabold tracking-widest">
                                        현재 담당 길드장
                                    </div>
                                    <div className="text-[14px] font-extrabold mt-0.5 flex items-center gap-1.5">
                                        주먹펴고 일어서{" "}
                                        <Chip tone="amber" icon="🛡️">
                                            던전 탐험가
                                        </Chip>
                                    </div>
                                    <div className="text-[12px] text-stone-500 mt-0.5">
                                        dungeon@maplestory.com
                                    </div>
                                </div>
                                <GameButton
                                    variant="soft"
                                    size="sm"
                                    leftIcon={<span>📣</span>}
                                >
                                    Google Chat으로 알리기
                                </GameButton>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6">
                        <div className="text-[11px] font-extrabold text-stone-700 tracking-widest uppercase mb-3 flex items-center gap-2">
                            <Gem scale={2} tone="amber" />
                            승인 대기 중 챌린지 · 미리 +20 EXP 받기
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                                {
                                    ico: "📖",
                                    title: "길드 행동 강령 읽기",
                                    sub: "3분 소요",
                                    xp: 20,
                                },
                                {
                                    ico: "⚔️",
                                    title: "퀘스트 미리보기",
                                    sub: "샘플 작업 둘러보기",
                                    xp: 0,
                                },
                            ].map((c) => (
                                <div
                                    key={c.title}
                                    className="p-4 rounded-lg bg-white border-2 border-stone-300 hover:border-amber-400 hover:shadow-[0_3px_0_0_#b45309] cursor-pointer transition-all flex items-center gap-3 group"
                                >
                                    <div className="w-11 h-11 rounded-md bg-amber-100 border-2 border-amber-300 grid place-items-center text-[20px]">
                                        {c.ico}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-[13px] font-extrabold text-stone-900">
                                            {c.title}
                                        </div>
                                        <div className="text-[11px] text-stone-500 font-mono-auth font-bold mt-0.5">
                                            {c.sub}
                                        </div>
                                    </div>
                                    {c.xp > 0 && (
                                        <Chip
                                            tone="amber"
                                            icon={<Gem scale={1.5} tone="amber" />}
                                        >
                                            +{c.xp} EXP
                                        </Chip>
                                    )}
                                    <span className="text-stone-400 group-hover:text-amber-600 transition-colors">
                                        {Icons.arrow(14)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PendingStep({
    step,
    connectorIndex,
}: {
    step: {
        label: string;
        sub: string;
        state: "done" | "now" | "todo";
        emoji: string;
    };
    connectorIndex: number;
}) {
    const boxShadow =
        step.state === "todo"
            ? "none"
            : `0 3px 0 0 ${step.state === "done" ? "#047857" : "#b45309"}`;
    return (
        <>
            <div
                className={`flex flex-col items-center gap-2 py-3 rounded-lg border-2 transition-all ${step.state === "now" ? "bg-amber-50 border-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]" : "border-transparent"}`}
            >
                <div
                    className={`w-12 h-12 rounded-md grid place-items-center font-black text-[18px] border-2 ${step.state === "done" ? "bg-emerald-400 border-emerald-700 text-emerald-950" : step.state === "now" ? "bg-amber-400 border-amber-700 text-amber-950" : "bg-stone-100 border-stone-300 text-stone-400"}`}
                    style={{ boxShadow }}
                >
                    {step.state === "done" ? "✓" : step.emoji}
                </div>
                <div>
                    <div
                        className={`text-[13px] font-extrabold ${step.state === "todo" ? "text-stone-400" : "text-stone-900"}`}
                    >
                        {step.label}
                    </div>
                    <div className="text-[11px] text-stone-500 font-mono-auth font-bold mt-0.5">
                        {step.sub}
                    </div>
                </div>
            </div>
            {connectorIndex < 2 && (
                <div className="grid grid-cols-3 gap-1">
                    {[0, 1, 2].map((k) => (
                        <div
                            key={k}
                            className="h-1.5 rounded-sm"
                            style={{
                                background:
                                    connectorIndex === 0
                                        ? k === 2
                                            ? "#f59e0b"
                                            : "#10b981"
                                        : "#d6d3d1",
                            }}
                        />
                    ))}
                </div>
            )}
        </>
    );
}
