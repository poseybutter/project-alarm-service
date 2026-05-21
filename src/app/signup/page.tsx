"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GameButton } from "@/components/auth/GameButton";
import { GameBar } from "@/components/auth/GameBar";
import { AuthField } from "@/components/auth/AuthField";
import { PixKey, Scroll, Shield } from "@/components/auth/Pix";
import { FallingLeaves } from "@/components/auth/FallingLeaves";
import { supabase } from "@/lib/supabase";
import {
    AuthLogo,
    CharBox,
    Chip,
    Icons,
} from "@/components/auth/atoms";

type Team = { id: string; name: string; icon: string | null };

const BIO_MAX = 200;
const ALLOWED_EMAIL_DOMAIN = "@example.com";

export default function SignupPage() {
    const router = useRouter();
    const [step, setStep] = useState<0 | 1>(0);
    const [code, setCode] = useState<string[]>(() => Array(8).fill(""));
    const [codeErr, setCodeErr] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [teams, setTeams] = useState<Team[]>([]);
    const [teamId, setTeamId] = useState("");
    const [openTeam, setOpenTeam] = useState(false);
    const [jobRole, setJobRole] = useState("");
    const [bio, setBio] = useState("");
    const [agree, setAgree] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitErr, setSubmitErr] = useState<string | null>(null);

    const cellRefs = useRef<Array<HTMLInputElement | null>>([]);

    // Google 로그인 세션에서 이메일 자동 채우기 — 사용자가 직접 수정 불가
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (cancelled) return;
            const userEmail = session?.user?.email;
            if (userEmail) setEmail(userEmail);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/teams");
                const data = (await res.json()) as Team[];
                if (cancelled || !Array.isArray(data)) return;
                setTeams(data);
                if (data[0]) setTeamId(data[0].id);
            } catch {
                if (!cancelled)
                    setSubmitErr(
                        "팀 목록을 불러오지 못했어요. 새로고침 해주세요.",
                    );
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const team = useMemo(
        () => teams.find((t) => t.id === teamId) ?? null,
        [teams, teamId],
    );

    const codeFull = code.every((c) => c !== "");

    function setCellChar(i: number, e: React.ChangeEvent<HTMLInputElement>) {
        const clean = e.target.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
        setCodeErr(null);
        if (clean.length === 0) {
            const next = [...code];
            next[i] = "";
            setCode(next);
            return;
        }
        // 마지막 문자만 사용해 기존 글자 위로 덮어쓰기 허용
        const ch = clean[clean.length - 1];
        const next = [...code];
        next[i] = ch;
        setCode(next);
        if (i < 7) cellRefs.current[i + 1]?.focus();
    }

    function handleCellKeyDown(
        i: number,
        e: React.KeyboardEvent<HTMLInputElement>,
    ) {
        if (e.key === "Backspace") {
            if (code[i]) return; // 현재 칸이 차있으면 onChange 가 처리
            if (i > 0) {
                e.preventDefault();
                const next = [...code];
                next[i - 1] = "";
                setCode(next);
                cellRefs.current[i - 1]?.focus();
            }
        } else if (e.key === "ArrowLeft" && i > 0) {
            cellRefs.current[i - 1]?.focus();
        } else if (e.key === "ArrowRight" && i < 7) {
            cellRefs.current[i + 1]?.focus();
        } else if (e.key === "Enter" && code.every((c) => c !== "")) {
            verifyCode();
        }
    }

    function handleCellPaste(
        i: number,
        e: React.ClipboardEvent<HTMLInputElement>,
    ) {
        const text = (e.clipboardData?.getData("text") || "")
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
        if (!text) return;
        e.preventDefault();
        const next = [...code];
        for (let j = 0; j < text.length && i + j < 8; j++) {
            next[i + j] = text[j];
        }
        setCode(next);
        setCodeErr(null);
        const lastIdx = Math.min(i + text.length, 7);
        cellRefs.current[lastIdx]?.focus();
    }

    async function verifyCode() {
        if (!codeFull || verifying) return;
        setVerifying(true);
        setCodeErr(null);
        try {
            const res = await fetch("/api/invitations/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: code.join("") }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                valid?: boolean;
                message?: string;
            };
            if (!res.ok || !data.valid) {
                setCodeErr(
                    data.message ?? "유효하지 않은 초대코드입니다.",
                );
                return;
            }
            // 성공 — 서버가 ud2_invite 쿠키 발급. STEP1 로 진입.
            setStep(1);
        } catch {
            setCodeErr(
                "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
            );
        } finally {
            setVerifying(false);
        }
    }

    const emailValid =
        /\S+@\S+\.\S+/.test(email) &&
        email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN);

    const filled = [
        name.length >= 2,
        emailValid,
        !!teamId,
        agree,
    ].filter(Boolean).length;
    const formValid = filled === 4;

    async function submit() {
        if (!formValid || submitting) return;
        setSubmitErr(null);
        setSubmitting(true);
        try {
            const res = await fetch("/api/guild-join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    email,
                    team_id: teamId,
                    role: jobRole,
                    bio,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error("[signup] /api/guild-join failed:", {
                    status: res.status,
                    body: data,
                });
            }
            if (res.status === 400 && data?.error === "INVITE_REQUIRED") {
                // 초대코드 쿠키 없음 → STEP0 로 되돌려서 다시 검증
                setStep(0);
                setCodeErr("초대코드 검증이 필요해요.");
                return;
            }
            if (!res.ok) {
                if (
                    typeof data?.message === "string" &&
                    /열쇠|초대|invitation|code/i.test(data.message)
                ) {
                    setStep(0);
                    setCodeErr(data.message);
                    return;
                }
                setSubmitErr(
                    data?.message || "가입 신청에 실패했어요.",
                );
                return;
            }
            router.push("/pending");
        } catch {
            setSubmitErr(
                "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
            );
        } finally {
            setSubmitting(false);
        }
    }


    return (
        <div
            className="min-h-screen w-full text-stone-900 relative overflow-hidden bg-gradient-to-br from-amber-50 via-amber-100/40 to-stone-50"
            style={{
                fontFamily:
                    "'SUIT Variable', 'Pretendard Variable', system-ui, sans-serif",
            }}
        >
            <div
                className="absolute inset-0 opacity-40 pointer-events-none"
                style={{
                    backgroundImage:
                        "radial-gradient(circle at 1px 1px, #b45309 1px, transparent 0)",
                    backgroundSize: "16px 16px",
                    maskImage:
                        "radial-gradient(900px 700px at 50% 35%, #000, transparent 75%)",
                    WebkitMaskImage:
                        "radial-gradient(900px 700px at 50% 35%, #000, transparent 75%)",
                }}
            />
            <FallingLeaves count={18} />

            <div className="relative min-h-screen flex flex-col items-center px-6 sm:px-8 py-10">
                <div className="w-full max-w-[480px] flex items-center justify-between">
                    <AuthLogo size={32} />
                    <div className="flex items-center gap-1.5 text-[11px] text-stone-400 font-bold">
                        <span className={step === 0 ? "text-amber-700" : ""}>
                            STEP 01 · 열쇠
                        </span>
                        <span>›</span>
                        <span className={step === 1 ? "text-amber-700" : ""}>
                            STEP 02 · 모험가 정보
                        </span>
                    </div>
                </div>

                <div className="flex-1 w-full flex flex-col items-center justify-center py-8">
                    {step === 0 && (
                        <>
                            {/* Floating 열쇠 */}
                            <div className="mb-6">
                                <div className="auth-wobble">
                                    <PixKey scale={6} />
                                </div>
                            </div>

                            {/* INVITATION 게임 카드 — 열쇠 입력 폼 */}
                            <div
                                className="w-full max-w-[460px] bg-white border-2 border-stone-800 rounded-xl overflow-hidden"
                                style={{ boxShadow: "0 6px 0 0 #1c1917" }}
                            >
                                <div className="h-7 bg-amber-400 border-b-2 border-stone-800 grid place-items-center">
                                    <div className="text-[10px] font-extrabold text-amber-950 tracking-widest font-mono-auth">
                                        ★ INVITATION FROM GUILD MASTER ★
                                    </div>
                                </div>

                                <div className="p-6">
                                    <div className="flex items-start justify-between mb-5">
                                        <div>
                                            <div className="text-[10px] text-amber-700 font-mono-auth font-extrabold tracking-widest">
                                                WORKSPACE
                                            </div>
                                            <div className="text-[20px] font-black tracking-tight text-stone-900 mt-1">
                                                UD2팀 길드
                                            </div>
                                            <div className="text-[12px] text-stone-500 mt-0.5">
                                                Markup Story · 봄 시즌
                                            </div>
                                        </div>
                                        <Shield scale={3} />
                                    </div>

                                    <div className="text-[10px] text-stone-400 font-mono-auth font-bold mb-1.5 tracking-widest">
                                        길드장
                                    </div>
                                    <div className="flex items-center gap-2 mb-5">
                                        <CharBox
                                            name="주"
                                            color="#f59e0b"
                                            size={32}
                                            level={12}
                                        />
                                        <div className="text-[13px]">
                                            <b className="text-stone-900">
                                                주먹펴고 일어서
                                            </b>
                                            <span className="text-stone-500">
                                                {" "}
                                                · 길드장 (Admin)
                                            </span>
                                        </div>
                                    </div>

                                    <div className="border-t-2 border-dashed border-stone-200 pt-4 grid grid-cols-3 gap-2.5">
                                        {[
                                            { l: "VALID", v: "26.06.10" },
                                            { l: "SLOTS", v: "3 / 5" },
                                            { l: "START", v: "Lv. 1" },
                                        ].map((m) => (
                                            <div
                                                key={m.l}
                                                className="bg-stone-50 border-2 border-stone-200 rounded-md p-2 text-center"
                                            >
                                                <div className="text-[9px] text-stone-400 font-mono-auth font-extrabold mb-1">
                                                    {m.l}
                                                </div>
                                                <div className="text-[12px] font-mono-auth font-extrabold text-stone-900">
                                                    {m.v}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-5 pt-4 border-t-2 border-dashed border-stone-200">
                                        <div className="mb-2 flex justify-between items-baseline">
                                            <span className="text-[12px] font-extrabold text-stone-700 tracking-tight">
                                                🔑 비밀 열쇠 코드
                                            </span>
                                            <span className="text-[11px] font-mono-auth font-bold text-stone-400">
                                                4 + 4 · A-Z / 0-9
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 w-full">
                                            {Array.from({ length: 8 }).map(
                                                (_, i) => (
                                                    <Fragment key={i}>
                                                        <input
                                                            ref={(el) => {
                                                                cellRefs.current[
                                                                    i
                                                                ] = el;
                                                            }}
                                                            value={
                                                                code[i] || ""
                                                            }
                                                            onChange={(e) =>
                                                                setCellChar(
                                                                    i,
                                                                    e,
                                                                )
                                                            }
                                                            onKeyDown={(e) =>
                                                                handleCellKeyDown(
                                                                    i,
                                                                    e,
                                                                )
                                                            }
                                                            onPaste={(e) =>
                                                                handleCellPaste(
                                                                    i,
                                                                    e,
                                                                )
                                                            }
                                                            onFocus={(e) =>
                                                                e.target.select()
                                                            }
                                                            inputMode="text"
                                                            autoCapitalize="characters"
                                                            autoComplete="off"
                                                            autoFocus={
                                                                i === 0
                                                            }
                                                            aria-label={`초대코드 ${i + 1}번째 글자`}
                                                            className={`min-w-0 flex-1 h-10 text-center font-black text-[18px] border-2 rounded font-mono-auth outline-none transition-colors uppercase ${
                                                                codeErr
                                                                    ? "bg-red-50 border-red-400 text-red-700"
                                                                    : code[i]
                                                                      ? "bg-amber-100 border-amber-500 text-amber-900"
                                                                      : "bg-stone-50 border-stone-300 text-stone-300 placeholder:text-stone-300"
                                                            }`}
                                                            placeholder="·"
                                                        />
                                                        {i === 3 && (
                                                            <span className="text-stone-400 font-black mx-0.5">
                                                                —
                                                            </span>
                                                        )}
                                                    </Fragment>
                                                ),
                                            )}
                                        </div>

                                        {codeErr && (
                                            <div className="mt-2 text-[12px] text-red-600 font-bold flex gap-1 items-center">
                                                ⚠ {codeErr}
                                            </div>
                                        )}

                                        <div className="mt-3 text-[11px] font-bold text-stone-500 flex items-center gap-1.5">
                                            🛡️ 열쇠는 1회만 사용 가능 · 5회
                                            실패 시 IP 일시 차단
                                        </div>

                                        <div className="mt-4">
                                            <GameButton
                                                variant="primary"
                                                size="lg"
                                                full
                                                disabled={
                                                    !codeFull || verifying
                                                }
                                                onClick={verifyCode}
                                                rightIcon={Icons.arrow()}
                                            >
                                                {verifying
                                                    ? "열쇠 확인 중…"
                                                    : "🔓 봉인 해제"}
                                            </GameButton>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 열쇠가 없으신가요 */}
                            <div className="mt-5 w-full max-w-[460px] p-4 rounded-lg bg-amber-50 border-2 border-amber-300">
                                <div className="flex items-start gap-3">
                                    <Scroll scale={3} />
                                    <div className="text-[12px] text-amber-900 leading-relaxed">
                                        <b className="text-stone-900">
                                            열쇠가 없으신가요?
                                        </b>
                                        <br />
                                        길드장(관리자)에게 열쇠 발급을
                                        요청하세요. Google Chat{" "}
                                        <span className="font-mono-auth font-bold">
                                            ud2팀
                                        </span>{" "}
                                        스페이스에서 도움을 받을 수 있어요.
                                    </div>
                                </div>
                            </div>

                            {/* 4명의 길드원 */}
                            <div className="mt-5 w-full max-w-[460px] flex items-center gap-3 text-[12px] text-stone-600 px-1">
                                <div className="flex">
                                    {[
                                        { n: "석", c: "#f59e0b", lv: 12 },
                                        { n: "연", c: "#0ea5e9", lv: 9 },
                                        { n: "헌", c: "#10b981", lv: 7 },
                                        { n: "지", c: "#ef4444", lv: 6 },
                                    ].map((p, i) => (
                                        <div
                                            key={i}
                                            style={{
                                                marginLeft: i ? -10 : 0,
                                            }}
                                        >
                                            <CharBox
                                                name={p.n}
                                                color={p.c}
                                                size={36}
                                                level={p.lv}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div>
                                    <b className="text-stone-900">
                                        4명의 길드원
                                    </b>
                                    이 새 동료를 기다려요
                                </div>
                            </div>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <div className="mb-6">
                                <div className="auth-wobble">
                                    <Scroll scale={6} />
                                </div>
                            </div>

                            <div
                                className="w-full max-w-[460px] bg-white border-2 border-stone-800 rounded-xl p-6"
                                style={{ boxShadow: "0 6px 0 0 #1c1917" }}
                            >
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[11px] text-amber-700 font-extrabold tracking-widest">
                                    CHAPTER 02 · PROFILE
                                </span>
                                <Chip tone="green" icon={Icons.check(10)}>
                                    봉인 해제됨
                                </Chip>
                            </div>
                            <h1 className="text-[24px] font-black tracking-tight leading-[1.2]">
                                모험가 정보 등록
                            </h1>
                            <p className="text-[13px] text-stone-500 mt-1 mb-4">
                                길드장이 신청을 검토하고 승인하면 정식 길드원이
                                돼요.
                            </p>

                            <div className="mb-5">
                                <GameBar
                                    value={filled}
                                    max={4}
                                    segments={12}
                                    label="가입 진척도"
                                    sub={`${filled} / 4`}
                                />
                            </div>

                            <div className="flex flex-col gap-3">
                                <AuthField
                                    label="이름"
                                    placeholder="홍길동"
                                    icon={Icons.user()}
                                    value={name}
                                    onChange={setName}
                                    autoFocus
                                    name="name"
                                    autoComplete="name"
                                    hint={
                                        name.length >= 2 ? (
                                            <span className="text-emerald-600 font-bold">
                                                ✓ 확인
                                            </span>
                                        ) : (
                                            "2자 이상"
                                        )
                                    }
                                />
                                {/* 팀 선택 — 이름 아래 */}
                                <div>
                                    <div className="text-[12px] font-extrabold text-stone-700 mb-1.5 flex justify-between items-baseline">
                                        <span>
                                            소속 팀{" "}
                                            <span className="text-red-500">
                                                *
                                            </span>
                                        </span>
                                        <span className="text-[11px] font-medium text-stone-400">
                                            가입 후 변경 가능
                                        </span>
                                    </div>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setOpenTeam(!openTeam)
                                            }
                                            className={`w-full flex items-center gap-3 px-3.5 py-3 bg-white rounded-lg border-2 transition-all ${
                                                openTeam
                                                    ? "border-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.22)]"
                                                    : "border-stone-300"
                                            }`}
                                        >
                                            <span className="text-[22px] leading-none">
                                                {team?.icon ?? "🏰"}
                                            </span>
                                            <div className="flex-1 text-left">
                                                <div className="text-[14px] font-extrabold text-stone-900">
                                                    {team?.name ??
                                                        "팀을 선택하세요"}
                                                </div>
                                                <div className="text-[11px] text-stone-500 font-mono-auth font-bold">
                                                    {teams.length}개 팀
                                                </div>
                                            </div>
                                            <span className="text-stone-400 font-black">
                                                {openTeam ? "▲" : "▼"}
                                            </span>
                                        </button>
                                        {openTeam && teams.length > 0 && (
                                            <div
                                                className="absolute z-10 left-0 right-0 mt-1.5 bg-white border-2 border-stone-800 rounded-lg overflow-hidden"
                                                style={{
                                                    boxShadow:
                                                        "0 4px 0 0 #1c1917",
                                                }}
                                            >
                                                {teams.map((t, i) => (
                                                    <button
                                                        key={t.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setTeamId(t.id);
                                                            setOpenTeam(false);
                                                        }}
                                                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 transition-colors text-left ${
                                                            t.id === teamId
                                                                ? "bg-amber-50"
                                                                : "hover:bg-stone-50"
                                                        } ${
                                                            i !==
                                                            teams.length - 1
                                                                ? "border-b-2 border-stone-100"
                                                                : ""
                                                        }`}
                                                    >
                                                        <span className="text-[20px] leading-none">
                                                            {t.icon ?? "🏰"}
                                                        </span>
                                                        <div className="flex-1 text-[13px] font-extrabold text-stone-900">
                                                            {t.name}
                                                        </div>
                                                        {t.id === teamId && (
                                                            <span className="text-amber-600 font-black">
                                                                ✓
                                                            </span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 직급/역할 — 팀 아래 */}
                                <AuthField
                                    label={
                                        <span>
                                            직급 / 역할{" "}
                                            <span className="text-[10px] font-mono-auth text-stone-400 font-bold">
                                                (선택)
                                            </span>
                                        </span>
                                    }
                                    placeholder="예: 퍼블리셔, 프론트엔드 개발자"
                                    icon={Icons.user()}
                                    value={jobRole}
                                    onChange={setJobRole}
                                    name="role"
                                    autoComplete="organization-title"
                                    maxLength={60}
                                />

                                {/* 각오 한마디 — 직급 아래 */}
                                <div>
                                    <div className="text-[12px] font-extrabold text-stone-700 mb-1.5 flex justify-between items-baseline">
                                        <span className="flex items-center gap-1.5">
                                            📝 각오 한마디{" "}
                                            <span className="text-[10px] font-mono-auth text-stone-400 font-bold">
                                                (선택)
                                            </span>
                                        </span>
                                        <span
                                            className={`text-[11px] font-mono-auth font-bold ${bio.length > BIO_MAX ? "text-red-600" : "text-stone-400"}`}
                                        >
                                            {bio.length} / {BIO_MAX}
                                        </span>
                                    </div>
                                    <textarea
                                        value={bio}
                                        onChange={(e) =>
                                            setBio(
                                                e.target.value.slice(0, BIO_MAX),
                                            )
                                        }
                                        placeholder="길드에 합류하는 각오를 적어주세요! 🔥"
                                        rows={3}
                                        className="w-full bg-white rounded-lg border-2 border-stone-300 px-3.5 py-3 text-[13.5px] font-medium text-stone-900 placeholder:text-stone-400 outline-none focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.22)] transition-all resize-none"
                                    />
                                    <div className="mt-1.5 text-[11px] text-stone-500 flex items-center gap-1.5">
                                        🛡️ 각오는 길드장만 볼 수 있어요
                                    </div>
                                </div>

                                <AuthField
                                    label="Google 계정 이메일"
                                    placeholder={`name${ALLOWED_EMAIL_DOMAIN}`}
                                    icon={Icons.mail()}
                                    value={email}
                                    onChange={setEmail}
                                    name="email"
                                    autoComplete="email"
                                    type="email"
                                    readOnly
                                    hint={
                                        <span className="text-stone-500">
                                            Google 로그인 계정 이메일입니다
                                        </span>
                                    }
                                />

                                <label
                                    className="flex items-start gap-2.5 mt-1 cursor-pointer select-none"
                                    onClick={() => setAgree(!agree)}
                                >
                                    <span
                                        className={`mt-0.5 w-[18px] h-[18px] grid place-items-center text-white flex-shrink-0 border-2 transition-colors ${agree ? "bg-amber-400 border-amber-700" : "bg-white border-stone-300"}`}
                                    >
                                        {agree && Icons.check(12)}
                                    </span>
                                    <span className="text-[12px] text-stone-600 leading-relaxed">
                                        <b className="text-stone-900">
                                            길드 행동 강령
                                        </b>
                                        과{" "}
                                        <b className="text-stone-900">
                                            개인정보 처리방침
                                        </b>
                                        에 동의하며, 내 작업 활동이 길드원에게
                                        표시될 수 있다는 점에 동의합니다.
                                    </span>
                                </label>

                                {submitErr && (
                                    <div className="text-[12px] text-red-600 font-bold flex gap-1 items-center">
                                        ⚠ {submitErr}
                                    </div>
                                )}

                                <div className="flex gap-2 mt-2">
                                    <GameButton
                                        variant="ghost"
                                        size="lg"
                                        className="flex-shrink-0 whitespace-nowrap"
                                        onClick={() => setStep(0)}
                                    >
                                        ← 이전
                                    </GameButton>
                                    <GameButton
                                        variant="primary"
                                        size="lg"
                                        full
                                        disabled={!formValid || submitting}
                                        onClick={submit}
                                        rightIcon={Icons.arrow()}
                                    >
                                        {submitting
                                            ? "제출 중…"
                                            : "📜 가입 신청서 제출"}
                                    </GameButton>
                                </div>
                            </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="w-full max-w-[480px] flex justify-between text-[12px] text-stone-400 font-bold">
                    <span>
                        이미 길드원이신가요?{" "}
                        <a
                            className="text-amber-700 cursor-pointer"
                            onClick={() => router.push("/login")}
                        >
                            로그인
                        </a>
                    </span>
                    <span>© 2026 UD2</span>
                </div>
            </div>
        </div>
    );
}
