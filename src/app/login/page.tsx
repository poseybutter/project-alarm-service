"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signInWithGoogle } from "@/lib/auth";
import { GameButton } from "@/components/auth/GameButton";
import { GameBar } from "@/components/auth/GameBar";
import { Hero, Gem } from "@/components/auth/Pix";
import {
    AuthLogo,
    CharBox,
    Chip,
    Icons,
} from "@/components/auth/atoms";

function LoginContent() {
    const searchParams = useSearchParams();
    const rejected =
        searchParams.get("rejected") === "1" ||
        searchParams.get("error") === "rejected";
    const errorMessage = rejected
        ? "이전 가입 신청이 거부되었습니다."
        : null;

    return (
        <div
            className="min-h-screen w-full bg-white text-stone-900 flex"
            style={{
                fontFamily:
                    "'SUIT Variable', 'Pretendard Variable', system-ui, sans-serif",
            }}
        >
            <div className="w-full lg:w-[560px] flex flex-col justify-between px-8 lg:px-16 py-12 border-r-2 border-stone-200 bg-white min-h-screen">
                <AuthLogo size={32} />

                <div className="max-w-[400px] w-full">
                    <div className="mb-7">
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-amber-800 bg-amber-50 border-2 border-amber-400 rounded-md px-2 py-0.5 mb-4">
                            <span className="w-1.5 h-1.5 bg-amber-500" />
                            CHAPTER 02 · 봄 시즌 진행 중
                        </div>
                        <h1 className="text-[30px] font-black tracking-tight leading-[1.15] text-stone-900">
                            다시 만나서 반가워요.
                        </h1>
                        <p className="text-[14px] text-stone-500 mt-2">
                            어제 작업으로{" "}
                            <b className="text-amber-700">+240 EXP</b>를
                            쌓았어요. 이어서 시작해 볼까요?
                        </p>
                    </div>

                    <div className="flex flex-col gap-3">
                        {errorMessage && (
                            <div className="p-3 bg-red-50 border-2 border-red-300 rounded-md text-[13px] text-red-700 font-bold">
                                {errorMessage}
                            </div>
                        )}

                        <GameButton
                            variant="primary"
                            size="lg"
                            full
                            onClick={() => {
                                void signInWithGoogle();
                            }}
                            leftIcon={<GoogleMark />}
                            rightIcon={Icons.arrow()}
                        >
                            <span>Google 로그인</span>
                        </GameButton>
                    </div>

                    {/* TODO: 초대코드 가입 플로우 재오픈 시 주석 해제
                    <div className="flex items-center gap-3 my-6 text-[11px] font-bold text-stone-400 uppercase tracking-widest">
                        <div className="flex-1 h-[2px] bg-stone-200" />
                        아직 길드원이 아닌가요?
                        <div className="flex-1 h-[2px] bg-stone-200" />
                    </div>

                    <GameButton
                        variant="ghost"
                        size="lg"
                        full
                        onClick={() => router.push("/signup")}
                    >
                        <span>🔑 초대코드로 길드 가입하기</span>
                    </GameButton>
                    */}

                    <div className="mt-5 p-3 bg-stone-50 border-2 border-stone-200 rounded-md flex gap-2 text-[12px] text-stone-600">
                        <div className="text-stone-400 pt-0.5">🛡️</div>
                        <span>
                            <b className="text-stone-900">UD2 내부 전용</b>{" "}
                            워크스페이스 — 외부 접근은 감사 로그에 기록됩니다.
                        </span>
                    </div>
                </div>

                <div className="flex gap-4 text-[11px] text-stone-400 font-bold mt-2">
                    <span>© 2026 UD2 Publishing</span>
                    <a className="hover:text-stone-600 cursor-pointer">
                        도움말
                    </a>
                    <a className="hover:text-stone-600 cursor-pointer">상태</a>
                </div>
            </div>

            {/* RIGHT — 게임 사이드 */}
            <div className="hidden lg:block flex-1 relative overflow-hidden bg-gradient-to-b from-amber-50 via-amber-100 to-amber-50">
                <div
                    className="absolute inset-0 opacity-50"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle at 1px 1px, #b45309 1px, transparent 0)",
                        backgroundSize: "16px 16px",
                        maskImage:
                            "radial-gradient(800px 600px at 50% 40%, #000, transparent 75%)",
                        WebkitMaskImage:
                            "radial-gradient(800px 600px at 50% 40%, #000, transparent 75%)",
                    }}
                />

                <div className="relative h-full flex flex-col justify-center items-center p-12 min-h-screen">
                    <div className="mb-6 relative">
                        <div className="absolute inset-0 translate-y-2 bg-amber-300/60 rounded-full blur-xl" />
                        <div className="auth-bob">
                            <Hero scale={6} />
                        </div>
                        <div
                            className="absolute -top-2 -right-8 px-3 py-1.5 bg-white border-2 border-stone-800 rounded-md text-[12px] font-extrabold text-stone-800 whitespace-nowrap"
                            style={{ boxShadow: "0 3px 0 0 #1c1917" }}
                        >
                            어서 와요!
                            <div className="absolute -bottom-[6px] left-3 w-2 h-2 bg-white border-r-2 border-b-2 border-stone-800 rotate-45" />
                        </div>
                    </div>

                    <div
                        className="w-[440px] bg-white border-2 border-stone-800 rounded-xl p-6"
                        style={{ boxShadow: "0 6px 0 0 #1c1917" }}
                    >
                        <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-dashed border-stone-200">
                            <div className="flex items-center gap-3">
                                <CharBox
                                    name="주"
                                    color="#f59e0b"
                                    level={12}
                                    size={44}
                                />
                                <div>
                                    <div className="text-[10px] text-stone-400 font-mono-auth font-bold tracking-wider">
                                        WELCOME BACK
                                    </div>
                                    <div className="text-[15px] font-extrabold text-stone-900 leading-tight">
                                        주먹펴고 일어서
                                    </div>
                                    <Chip tone="amber" icon="🛡️">
                                        던전 탐험가
                                    </Chip>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-stone-400 font-mono-auth font-bold">
                                    STREAK
                                </div>
                                <div className="text-[18px] font-black text-amber-600 leading-tight font-mono-auth">
                                    🔥14
                                </div>
                            </div>
                        </div>

                        <GameBar
                            value={1240}
                            max={1500}
                            label="Lv. 12 · NEXT"
                            sub="1,240 / 1,500 EXP"
                            segments={20}
                        />

                        <div className="mt-5">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-[11px] font-extrabold text-stone-700 tracking-widest uppercase">
                                    📜 오늘의 퀘스트
                                </div>
                                <span className="text-[11px] font-mono-auth text-stone-500 font-bold">
                                    0 / 3
                                </span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                {[
                                    {
                                        t: "메인 헤더 마크업 리뷰",
                                        xp: 60,
                                        urgent: true,
                                    },
                                    {
                                        t: "상품 카드 컴포넌트 마무리",
                                        xp: 120,
                                    },
                                    { t: "QA 피드백 3건 반영", xp: 80 },
                                ].map((q) => (
                                    <div
                                        key={q.t}
                                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-stone-50 border-2 border-stone-200"
                                    >
                                        <div className="w-4 h-4 border-2 border-stone-400 bg-white flex-shrink-0" />
                                        <div className="flex-1 text-[13px] text-stone-800 font-bold">
                                            {q.t}
                                        </div>
                                        {q.urgent && (
                                            <Chip tone="red">D-1</Chip>
                                        )}
                                        <span className="flex items-center gap-1 text-[11px] font-extrabold text-amber-700 font-mono-auth">
                                            <Gem scale={2} tone="amber" />+
                                            {q.xp}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 w-[440px] flex items-center gap-3 px-1">
                        <div className="flex">
                            {[
                                { n: "석", c: "#0ea5e9" },
                                { n: "연", c: "#10b981" },
                                { n: "헌", c: "#f59e0b" },
                                { n: "지", c: "#ef4444" },
                            ].map((p, i) => (
                                <div
                                    key={i}
                                    style={{ marginLeft: i ? -8 : 0 }}
                                >
                                    <CharBox
                                        name={p.n}
                                        color={p.c}
                                        size={30}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="text-[12px] text-stone-600">
                            <b className="text-stone-900">4명</b>이 지금 길드
                            안에서 작업 중 · 오늘 누적{" "}
                            <b className="text-amber-700">+820 EXP</b>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    );
}

function GoogleMark() {
    return (
        <svg
            width={18}
            height={18}
            viewBox="0 0 48 48"
            aria-hidden
        >
            <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3c-1.7 4.7-6.2 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
            />
            <path
                fill="#FF3D00"
                d="m6.3 14.7 6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
            />
            <path
                fill="#4CAF50"
                d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.3 2.4-5.1 0-9.5-3.3-11.2-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
            />
            <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2C40.9 36.4 44 30.7 44 24c0-1.2-.1-2.4-.4-3.5z"
            />
        </svg>
    );
}
