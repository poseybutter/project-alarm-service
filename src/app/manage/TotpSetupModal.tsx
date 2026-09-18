"use client";

import { useEffect, useRef, useState } from "react";

type TotpSetupModalProps = {
    open: boolean;
    onClose: () => void;
    onSetupComplete: () => void;
    setup: () => Promise<{ qrDataUrl: string; secret: string }>;
    verifySetup: (code: string) => Promise<{ ok: boolean; message?: string }>;
};

type Step = "loading" | "scan" | "verify" | "done";

export default function TotpSetupModal({
    open,
    onClose,
    onSetupComplete,
    setup,
    verifySetup,
}: TotpSetupModalProps) {
    const [step, setStep] = useState<Step>("loading");
    const [qrDataUrl, setQrDataUrl] = useState("");
    const [secret, setSecret] = useState("");
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [copied, setCopied] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setStep("loading");
        setCode("");
        setError("");
        setCopied(false);
        setup()
            .then(({ qrDataUrl: qr, secret: s }) => {
                setQrDataUrl(qr);
                setSecret(s);
                setStep("scan");
            })
            .catch(() => {
                setError("TOTP 셋업에 실패했습니다.");
                setStep("scan");
            });
    }, [open, setup]);

    useEffect(() => {
        if (step === "verify") inputRef.current?.focus();
    }, [step]);

    if (!open) return null;

    const handleVerify = async () => {
        if (code.length !== 6 || verifying) return;
        setVerifying(true);
        setError("");
        try {
            const res = await verifySetup(code);
            if (res.ok) {
                setStep("done");
                setTimeout(() => {
                    onSetupComplete();
                    onClose();
                }, 1200);
            } else {
                setError(res.message || "코드가 올바르지 않습니다.");
                setCode("");
                inputRef.current?.focus();
            }
        } catch {
            setError("검증에 실패했습니다.");
        } finally {
            setVerifying(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard not available */ }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={(e) => { if (e.target === e.currentTarget && step !== "done") onClose(); }}
        >
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
                <h2 className="text-base font-extrabold text-stone-800 mb-1">
                    Google Authenticator 설정
                </h2>

                {step === "loading" && (
                    <p className="text-sm text-stone-500 py-8 text-center">준비 중...</p>
                )}

                {step === "scan" && (
                    <>
                        <p className="text-xs text-stone-500 mb-4">
                            Google Authenticator 앱에서 아래 QR 코드를 스캔하세요.
                        </p>
                        {qrDataUrl && (
                            <div className="flex justify-center mb-4">
                                <img
                                    src={qrDataUrl}
                                    alt="TOTP QR 코드"
                                    className="rounded-lg border border-stone-200"
                                    width={200}
                                    height={200}
                                />
                            </div>
                        )}
                        <div className="mb-4">
                            <p className="text-[10px] text-stone-400 mb-1">수동 입력 키:</p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 rounded bg-stone-100 px-2 py-1.5 text-xs font-mono text-stone-700 break-all select-all">
                                    {secret}
                                </code>
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="shrink-0 rounded bg-stone-200 px-2 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-300"
                                >
                                    {copied ? "복사됨" : "복사"}
                                </button>
                            </div>
                        </div>
                        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setStep("verify")}
                                className="flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600"
                            >
                                다음: 코드 입력
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
                            >
                                취소
                            </button>
                        </div>
                    </>
                )}

                {step === "verify" && (
                    <>
                        <p className="text-xs text-stone-500 mb-4">
                            Google Authenticator에 표시된 6자리 코드를 입력하세요.
                        </p>
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="000000"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                            onKeyDown={(e) => { if (e.key === "Enter") void handleVerify(); }}
                            className="mb-3 w-full rounded-lg border border-stone-300 px-4 py-3 text-center text-lg font-mono tracking-[0.4em] outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                        />
                        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={code.length !== 6 || verifying}
                                onClick={handleVerify}
                                className="flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                            >
                                {verifying ? "확인 중..." : "확인"}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setStep("scan"); setCode(""); setError(""); }}
                                className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
                            >
                                뒤로
                            </button>
                        </div>
                    </>
                )}

                {step === "done" && (
                    <div className="py-6 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                            <i className="ri-check-line text-2xl text-green-600" />
                        </div>
                        <p className="text-sm font-bold text-stone-700">설정 완료!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
