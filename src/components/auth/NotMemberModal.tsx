"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { GameButton } from "./GameButton";
import { Scroll } from "./Pix";

type Props = {
    onClose: () => void;
};

/**
 * 구글 로그인 성공했지만 players 테이블에 없는 신규 유저용 모달.
 * 4+4 초대코드 입력 → /api/invitations/verify → /guild-join 이동.
 */
export function NotMemberModal({ onClose }: Props) {
    const router = useRouter();
    const [code, setCode] = useState<[string, string]>(["", ""]);
    const [err, setErr] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const r1 = useRef<HTMLInputElement>(null);

    const codeFull = code[0].length === 4 && code[1].length === 4;

    function updateCode(i: 0 | 1, v: string) {
        const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
        setCode((prev) => {
            const next = [...prev] as [string, string];
            next[i] = cleaned;
            return next;
        });
        setErr(null);
        if (cleaned.length === 4 && i === 0) {
            r1.current?.focus();
        }
    }

    async function verify() {
        if (!codeFull || verifying) return;
        setVerifying(true);
        setErr(null);
        try {
            const res = await fetch("/api/invitations/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: code.join("") }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 429) {
                setErr(
                    data.message ??
                        "⛔ 너무 많이 시도했어요. 10분 후 다시 시도해주세요.",
                );
                return;
            }
            if (!res.ok || !data.valid) {
                setErr(data.message ?? "유효하지 않은 초대코드입니다.");
                return;
            }
            router.push("/guild-join");
        } catch {
            setErr("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
        } finally {
            setVerifying(false);
        }
    }

    function onKey1(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && code[0].length === 4) {
            r1.current?.focus();
        }
    }
    function onKey2(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && codeFull) void verify();
    }

    const inputCls = (filled: boolean) =>
        `flex-1 min-w-0 w-full h-14 text-center font-black text-[20px] sm:text-[22px] tracking-[0.14em] sm:tracking-[0.18em] uppercase rounded-lg bg-white outline-none transition-all border-[3px] font-mono-auth ${
            err
                ? "border-red-400 shadow-[0_0_0_4px_rgba(248,113,113,0.18)]"
                : filled
                  ? "border-amber-400 bg-amber-50 shadow-[0_0_0_4px_rgba(245,158,11,0.18)]"
                  : "border-stone-300"
        }`;

    return (
        <div
            className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm grid place-items-center px-4 sm:px-6"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-white border-2 border-stone-800 rounded-xl overflow-hidden"
                style={{ boxShadow: "0 8px 0 0 #1c1917" }}
            >
                {/* 타이틀 바 */}
                <div className="h-9 bg-red-400 border-b-2 border-stone-800 grid place-items-center relative">
                    <div className="text-[11px] font-extrabold text-red-950 tracking-widest font-mono-auth">
                        ★ ACCESS DENIED · 잠긴 문 ★
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="닫기"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 bg-red-700 hover:bg-red-800 border-2 border-red-900 grid place-items-center text-white font-black text-[10px] rounded-sm"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-5 sm:p-7">
                    <div className="flex justify-center mb-4 text-[48px] leading-none">
                        🔒
                    </div>

                    <h2 className="text-[22px] font-black tracking-tight text-stone-900 text-center mb-1.5">
                        길드원이 아니에요!
                    </h2>
                    <p className="text-[13px] text-stone-600 leading-relaxed text-center mb-5">
                        이 워크스페이스는{" "}
                        <b className="text-stone-900">초대코드가 있는 모험가</b>만
                        입장할 수 있어요.
                        <br />
                        길드장이 발급한 8자리 열쇠를 입력해 봉인을 풀어보세요.
                    </p>

                    <div className="mb-2 flex justify-between items-baseline">
                        <span className="text-[11px] font-extrabold text-stone-700 tracking-widest flex items-center gap-1.5">
                            🔑 비밀 열쇠 코드
                        </span>
                        <span className="text-[10px] font-mono-auth font-bold text-stone-400">
                            4 + 4
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 w-full overflow-hidden">
                        <input
                            value={code[0]}
                            onChange={(e) => updateCode(0, e.target.value)}
                            onKeyDown={onKey1}
                            maxLength={4}
                            placeholder="XXXX"
                            autoFocus
                            className={inputCls(code[0].length === 4)}
                        />
                        <span className="text-stone-300 font-black text-xl flex-shrink-0">
                            —
                        </span>
                        <input
                            ref={r1}
                            value={code[1]}
                            onChange={(e) => updateCode(1, e.target.value)}
                            onKeyDown={onKey2}
                            maxLength={4}
                            placeholder="XXXX"
                            className={inputCls(code[1].length === 4)}
                        />
                    </div>

                    {err && (
                        <div className="mt-2 text-[12px] text-red-600 font-bold flex gap-1 items-center">
                            ⚠ {err}
                        </div>
                    )}

                    <div className="mt-3 text-[11px] font-bold text-stone-500 flex items-center gap-1.5">
                        🛡️ 열쇠는 1회만 사용 가능 · 5회 실패 시 IP 일시 차단
                    </div>

                    <div className="flex gap-2 mt-5">
                        <GameButton
                            variant="ghost"
                            size="md"
                            onClick={onClose}
                            className="whitespace-nowrap flex-shrink-0"
                        >
                            닫기
                        </GameButton>
                        <GameButton
                            variant="primary"
                            size="md"
                            full
                            disabled={!codeFull || verifying}
                            onClick={verify}
                            className="whitespace-nowrap min-w-0"
                        >
                            {verifying ? "열쇠 확인 중…" : "🔓 봉인 해제"}
                        </GameButton>
                    </div>

                    <div className="mt-5 p-3 rounded-md bg-stone-50 border-2 border-stone-200 flex gap-2.5 items-start">
                        <Scroll scale={2} />
                        <div className="text-[11.5px] text-stone-600 leading-relaxed">
                            <b className="text-stone-900">
                                초대코드가 없으신가요?
                            </b>
                            <br />
                            팀 관리자에게 발급을 요청하거나, Google Chat{" "}
                            <span className="font-mono-auth font-bold text-stone-800">
                                ud2 워크스페이스
                            </span>{" "}
                            에서 도움을 받으세요.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
