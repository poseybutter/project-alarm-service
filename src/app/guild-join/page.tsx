"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GameButton } from "@/components/auth/GameButton";
import { GameBar } from "@/components/auth/GameBar";
import { AuthField } from "@/components/auth/AuthField";
import { Scroll } from "@/components/auth/Pix";
import { AuthLogo, CharBox, Chip, Icons } from "@/components/auth/atoms";

type Team = { id: string; name: string; icon: string | null };

export default function GuildJoinPage() {
    const router = useRouter();
    const [teams, setTeams] = useState<Team[]>([]);
    const [name, setName] = useState("");
    const [teamId, setTeamId] = useState("");
    const [bio, setBio] = useState("");
    const [agree, setAgree] = useState(false);
    const [openTeam, setOpenTeam] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const bioMax = 200;

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const res = await fetch("/api/teams");
                const data = (await res.json()) as Team[];
                if (cancelled) return;
                if (Array.isArray(data)) {
                    setTeams(data);
                    if (data[0]) setTeamId(data[0].id);
                }
            } catch {
                if (!cancelled)
                    setErr("팀 목록을 불러오지 못했어요. 새로고침 해주세요.");
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const team = useMemo(
        () => teams.find((t) => t.id === teamId) ?? null,
        [teams, teamId],
    );

    const filled = [name.length >= 2, !!teamId, agree].filter(Boolean).length;
    const formValid = filled === 3 && !submitting;

    async function submit() {
        if (!formValid) return;
        setSubmitting(true);
        setErr(null);
        try {
            const res = await fetch("/api/guild-join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, teamId, bio }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 400 && data.error === "INVITE_REQUIRED") {
                router.push("/login?new=1");
                return;
            }
            if (!res.ok) {
                setErr(
                    data.message ??
                        "가입 신청에 실패했어요. 잠시 후 다시 시도해 주세요.",
                );
                return;
            }
            router.push("/pending");
        } catch {
            setErr("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div
            className="min-h-screen w-full bg-white text-stone-900 flex"
            style={{
                fontFamily:
                    "'SUIT Variable', 'Pretendard Variable', system-ui, sans-serif",
            }}
        >
            {/* LEFT — 폼 */}
            <div className="w-full lg:w-[640px] flex flex-col justify-between px-8 lg:px-16 py-10 border-r-2 border-stone-200">
                <div className="flex items-center justify-between">
                    <AuthLogo size={32} />
                    <Chip tone="green" icon={Icons.check(10)}>
                        봉인 해제 완료
                    </Chip>
                </div>

                <div className="max-w-[480px] w-full -mt-6">
                    <div className="text-[11px] text-amber-700 font-extrabold mb-2 tracking-widest font-mono-auth">
                        CHAPTER 02 · PROFILE
                    </div>
                    <h1 className="text-[28px] font-black tracking-tight leading-[1.15]">
                        모험가 정보 등록
                    </h1>
                    <p className="text-[14px] text-stone-500 mt-2 mb-5">
                        길드에 합류하기 위한 정보를 입력해주세요.
                    </p>

                    <div className="mb-5">
                        <GameBar
                            value={filled}
                            max={3}
                            segments={12}
                            label="가입 진척도"
                            sub={`${filled} / 3`}
                        />
                    </div>

                    <div className="flex flex-col gap-4">
                        <AuthField
                            label={
                                <span>
                                    이름{" "}
                                    <span className="text-red-500">*</span>
                                </span>
                            }
                            placeholder="홍길동"
                            icon={Icons.user()}
                            value={name}
                            onChange={setName}
                            hint={
                                name.length >= 2 ? (
                                    <span className="text-emerald-600 font-bold">
                                        ✓ 확인
                                    </span>
                                ) : (
                                    "2자 이상"
                                )
                            }
                            autoFocus
                            name="name"
                        />

                        {/* 팀 선택 */}
                        <div>
                            <div className="text-[12px] font-extrabold text-stone-700 mb-1.5 flex justify-between items-baseline">
                                <span>
                                    소속 팀{" "}
                                    <span className="text-red-500">*</span>
                                </span>
                                <span className="text-[11px] font-medium text-stone-400">
                                    길드 합류 후 변경 가능
                                </span>
                            </div>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setOpenTeam(!openTeam)}
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
                                            {team?.name ?? "팀을 선택하세요"}
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
                                            boxShadow: "0 4px 0 0 #1c1917",
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
                                                    i !== teams.length - 1
                                                        ? "border-b-2 border-stone-100"
                                                        : ""
                                                }`}
                                            >
                                                <span className="text-[20px] leading-none">
                                                    {t.icon ?? "🏰"}
                                                </span>
                                                <div className="flex-1">
                                                    <div className="text-[13px] font-extrabold text-stone-900">
                                                        {t.name}
                                                    </div>
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

                        {/* 각오 */}
                        <div>
                            <div className="text-[12px] font-extrabold text-stone-700 mb-1.5 flex justify-between items-baseline">
                                <span className="flex items-center gap-1.5">
                                    📝 각오 한마디{" "}
                                    <span className="text-[10px] font-mono-auth text-stone-400 font-bold">
                                        (선택)
                                    </span>
                                </span>
                                <span
                                    className={`text-[11px] font-mono-auth font-bold ${bio.length > bioMax ? "text-red-600" : "text-stone-400"}`}
                                >
                                    {bio.length} / {bioMax}
                                </span>
                            </div>
                            <textarea
                                value={bio}
                                onChange={(e) =>
                                    setBio(e.target.value.slice(0, bioMax))
                                }
                                placeholder="길드에 합류하는 각오를 적어주세요! ex. 열심히 하겠습니다 🔥"
                                rows={3}
                                className="w-full bg-white rounded-lg border-2 border-stone-300 px-3.5 py-3 text-[13.5px] font-medium text-stone-900 placeholder:text-stone-400 outline-none focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.22)] transition-all resize-none"
                            />
                            <div className="mt-1.5 text-[11px] text-stone-500 flex items-center gap-1.5">
                                🛡️ 각오는 길드장만 볼 수 있어요
                            </div>
                        </div>

                        {/* 약관 */}
                        <label
                            className="flex items-start gap-2.5 cursor-pointer select-none"
                            onClick={() => setAgree(!agree)}
                        >
                            <span
                                className={`mt-0.5 w-[18px] h-[18px] grid place-items-center text-white flex-shrink-0 border-2 transition-colors ${
                                    agree
                                        ? "bg-amber-400 border-amber-700"
                                        : "bg-white border-stone-300"
                                }`}
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
                                에 동의하며, 내 작업 활동(EXP, 퀘스트 완료 등)이
                                길드원에게 표시되는 것에 동의합니다.
                            </span>
                        </label>

                        {err && (
                            <div className="p-3 bg-red-50 border-2 border-red-300 rounded-md text-[13px] text-red-700 font-bold">
                                ⚠ {err}
                            </div>
                        )}

                        <div className="flex gap-2 mt-2">
                            <GameButton
                                variant="ghost"
                                size="lg"
                                onClick={() => router.push("/login")}
                            >
                                ← 이전
                            </GameButton>
                            <GameButton
                                variant="primary"
                                size="lg"
                                full
                                disabled={!formValid}
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

                <div className="text-[11px] text-stone-400 font-bold">
                    © 2026 UD2 Publishing
                </div>
            </div>

            {/* RIGHT — 비주얼 */}
            <div className="hidden lg:block flex-1 relative overflow-hidden bg-gradient-to-br from-amber-50 via-amber-100/40 to-stone-50">
                <div
                    className="absolute inset-0 opacity-40"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle at 1px 1px, #b45309 1px, transparent 0)",
                        backgroundSize: "16px 16px",
                        maskImage:
                            "radial-gradient(700px 600px at 60% 40%, #000, transparent 75%)",
                        WebkitMaskImage:
                            "radial-gradient(700px 600px at 60% 40%, #000, transparent 75%)",
                    }}
                />

                <div className="relative h-full flex flex-col justify-center items-center p-12 min-h-screen">
                    <div className="mb-8">
                        <div className="auth-wobble">
                            <Scroll scale={6} />
                        </div>
                    </div>

                    <div
                        className="w-[460px] bg-white border-2 border-stone-800 rounded-xl overflow-hidden"
                        style={{ boxShadow: "0 6px 0 0 #1c1917" }}
                    >
                        <div className="h-7 bg-amber-400 border-b-2 border-stone-800 grid place-items-center">
                            <div className="text-[10px] font-extrabold text-amber-950 tracking-widest font-mono-auth">
                                ★ APPLICATION PREVIEW · 신청서 ★
                            </div>
                        </div>

                        <div className="p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <div className="text-[10px] text-amber-700 font-mono-auth font-extrabold tracking-widest">
                                        UD2 WORKSPACE · 가입 신청
                                    </div>
                                    <div className="text-[20px] font-black tracking-tight text-stone-900 mt-1">
                                        {name || "이름을 입력하세요"}
                                    </div>
                                    <div className="text-[12px] text-stone-500 mt-0.5 flex items-center gap-1.5">
                                        <span>{team?.icon ?? "🏰"}</span>
                                        {team?.name ?? "팀 선택 전"}
                                    </div>
                                </div>
                                <CharBox
                                    name={name[0] || "?"}
                                    size={50}
                                    color="#a8a29e"
                                />
                            </div>

                            <div className="border-t-2 border-dashed border-stone-200 pt-4">
                                <div className="text-[10px] text-stone-400 font-mono-auth font-extrabold mb-2 tracking-widest">
                                    각오 한마디
                                </div>
                                <div
                                    className={`min-h-[60px] p-3 rounded-md text-[13px] leading-relaxed border-2 ${
                                        bio
                                            ? "bg-amber-50 border-amber-300 text-stone-800"
                                            : "bg-stone-50 border-stone-200 text-stone-300 italic"
                                    }`}
                                >
                                    {bio || "(아직 작성되지 않았어요)"}
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t-2 border-dashed border-stone-200 grid grid-cols-3 gap-2.5">
                                {[
                                    { l: "STATUS", v: "PENDING" },
                                    {
                                        l: "TEAM",
                                        v: (team?.name ?? "—").slice(0, 4),
                                    },
                                    { l: "START", v: "Lv. 1" },
                                ].map((m) => (
                                    <div
                                        key={m.l}
                                        className="bg-stone-50 border-2 border-stone-200 rounded-md p-2 text-center"
                                    >
                                        <div className="text-[9px] text-stone-400 font-mono-auth font-extrabold mb-1">
                                            {m.l}
                                        </div>
                                        <div className="text-[11px] font-mono-auth font-extrabold text-stone-900">
                                            {m.v}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
