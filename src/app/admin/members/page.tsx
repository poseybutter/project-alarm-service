"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameButton } from "@/components/auth/GameButton";
import { AuthField } from "@/components/auth/AuthField";
import { Shield, PixKey } from "@/components/auth/Pix";
import { AuthLogo, CharBox, Chip, Icons } from "@/components/auth/atoms";

type PlayerRow = {
    id: number;
    name: string;
    email: string;
    team_id: string | null;
    status: "pending" | "active" | "rejected";
    role: "member" | "admin";
    bio: string | null;
    created_at: string;
};

type Team = { id: string; name: string; icon: string | null };

type Invitation = {
    id: number;
    code: string;
    team_id: string | null;
    issued_by: string | null;
    issued_at: string;
    expires_at: string;
    used: boolean;
    used_by: string | null;
    used_at: string | null;
};

type FilterKey = "all" | "today" | "risk";
type CodeFilter = "active" | "used" | "expired";

function formatCode(code: string): string {
    if (code.length !== 8) return code;
    return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function elapsedLabel(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return "방금";
    const min = Math.floor(ms / 60000);
    if (min < 1) return "방금";
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr / 24);
    return `${day}일 전`;
}

function isToday(iso: string): boolean {
    const d = new Date(iso);
    const n = new Date();
    return (
        d.getFullYear() === n.getFullYear() &&
        d.getMonth() === n.getMonth() &&
        d.getDate() === n.getDate()
    );
}

export default function AdminMembersPage() {
    const [players, setPlayers] = useState<PlayerRow[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadErr, setLoadErr] = useState<string | null>(null);

    const [filter, setFilter] = useState<FilterKey>("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<number | null>(null);
    const [confirm, setConfirm] = useState<"approved" | "rejected" | null>(
        null,
    );
    const [acting, setActing] = useState(false);

    // 초대코드 발급
    const [issueTeam, setIssueTeam] = useState("");
    const [issueExpiry, setIssueExpiry] = useState<"1" | "7" | "30">("7");
    const [issuing, setIssuing] = useState(false);
    const [newCode, setNewCode] = useState<Invitation | null>(null);
    const [codeFilter, setCodeFilter] = useState<CodeFilter>("active");

    const reload = useCallback(async () => {
        setLoadErr(null);
        try {
            const [pRes, tRes, iRes] = await Promise.all([
                fetch("/api/admin/players?status=pending"),
                fetch("/api/teams"),
                fetch("/api/admin/invitations"),
            ]);
            if (pRes.status === 403) {
                setLoadErr("관리자 권한이 필요해요.");
                return;
            }
            if (!pRes.ok || !tRes.ok || !iRes.ok) {
                throw new Error("load failed");
            }
            const [pData, tData, iData] = (await Promise.all([
                pRes.json(),
                tRes.json(),
                iRes.json(),
            ])) as [PlayerRow[], Team[], Invitation[]];
            setPlayers(Array.isArray(pData) ? pData : []);
            setTeams(Array.isArray(tData) ? tData : []);
            setInvitations(Array.isArray(iData) ? iData : []);
            if (Array.isArray(tData) && tData[0] && !issueTeam) {
                setIssueTeam(tData[0].id);
            }
            if (Array.isArray(pData) && pData[0] && selected == null) {
                setSelected(pData[0].id);
            }
        } catch {
            setLoadErr("데이터를 불러오지 못했어요.");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const teamById = useMemo(() => {
        const m = new Map<string, Team>();
        teams.forEach((t) => m.set(t.id, t));
        return m;
    }, [teams]);

    const list = useMemo(() => {
        return players.filter((p) => {
            if (filter === "today" && !isToday(p.created_at)) return false;
            if (filter === "risk") {
                if (p.email.endsWith("@ud2.co") || p.email.endsWith("@example.com"))
                    return false;
            }
            if (search) {
                const q = search.toLowerCase();
                if (
                    !p.name.toLowerCase().includes(q) &&
                    !p.email.toLowerCase().includes(q)
                )
                    return false;
            }
            return true;
        });
    }, [players, filter, search]);

    const cur = useMemo(
        () => players.find((p) => p.id === selected) ?? null,
        [players, selected],
    );
    const curTeam = cur?.team_id ? teamById.get(cur.team_id) ?? null : null;
    const isExternal =
        cur != null &&
        !cur.email.endsWith("@ud2.co") &&
        !cur.email.endsWith("@example.com");

    async function decide(action: "approved" | "rejected") {
        if (!cur || acting) return;
        setActing(true);
        try {
            const verb = action === "approved" ? "approve" : "reject";
            const res = await fetch(
                `/api/admin/players/${cur.id}/${verb}`,
                { method: "PATCH" },
            );
            if (!res.ok) {
                alert("처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
                return;
            }
            // 결정된 항목은 pending 목록에서 빠짐 → 다음 항목 선택
            setPlayers((prev) => prev.filter((p) => p.id !== cur.id));
            const next = list.find((p) => p.id !== cur.id);
            setSelected(next?.id ?? null);
            setConfirm(null);
        } catch {
            alert("네트워크 오류가 발생했어요.");
        } finally {
            setActing(false);
        }
    }

    async function issueNew() {
        if (!issueTeam || issuing) return;
        setIssuing(true);
        try {
            const res = await fetch("/api/admin/invitations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    teamId: issueTeam,
                    expiresInDays: Number(issueExpiry),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.message ?? "초대코드 발급에 실패했어요.");
                return;
            }
            setNewCode(data as Invitation);
            setInvitations((prev) => [data, ...prev]);
        } catch {
            alert("네트워크 오류가 발생했어요.");
        } finally {
            setIssuing(false);
        }
    }

    const nowIso = new Date().toISOString();
    const codeCounts = useMemo(
        () => ({
            active: invitations.filter(
                (c) => !c.used && c.expires_at > nowIso,
            ).length,
            used: invitations.filter((c) => c.used).length,
            expired: invitations.filter(
                (c) => !c.used && c.expires_at <= nowIso,
            ).length,
        }),
        [invitations, nowIso],
    );

    const filteredCodes = useMemo(() => {
        return invitations.filter((c) => {
            if (codeFilter === "active") return !c.used && c.expires_at > nowIso;
            if (codeFilter === "used") return c.used;
            if (codeFilter === "expired")
                return !c.used && c.expires_at <= nowIso;
            return true;
        });
    }, [invitations, codeFilter, nowIso]);

    const pendingCount = players.length;
    const riskCount = players.filter(
        (p) =>
            !p.email.endsWith("@ud2.co") &&
            !p.email.endsWith("@example.com"),
    ).length;

    return (
        <div
            className="min-h-screen w-full bg-white text-stone-900 grid grid-rows-[60px_1fr]"
            style={{
                fontFamily:
                    "'SUIT Variable', 'Pretendard Variable', system-ui, sans-serif",
            }}
        >
            {/* HEADER */}
            <div className="flex items-center justify-between px-5 border-b-2 border-stone-800 bg-amber-50">
                <div className="flex items-center gap-3">
                    <AuthLogo size={26} withText={false} />
                    <div className="flex items-center gap-2">
                        <Shield scale={2.5} />
                        <div>
                            <div className="text-[14px] font-black tracking-tight leading-tight">
                                모험가 심사
                            </div>
                            <div className="text-[10px] text-amber-700 font-mono-auth font-extrabold tracking-widest">
                                GUILD MASTER · ADMIN
                            </div>
                        </div>
                    </div>
                    <div className="w-px h-6 bg-stone-300 ml-2" />
                    {[
                        { t: "📊 대시보드", active: false },
                        { t: "📜 퀘스트", active: false },
                        { t: "🛡️ 길드원", active: true },
                        { t: "⚙️ 설정", active: false },
                    ].map((m) => (
                        <button
                            key={m.t}
                            className={`text-[12px] px-2.5 py-1.5 rounded-md font-extrabold transition-colors border-2 ${m.active ? "bg-white border-stone-800 text-stone-900" : "border-transparent text-stone-500 hover:bg-amber-100"}`}
                        >
                            {m.t}
                            {m.active && pendingCount > 0 && (
                                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-black bg-red-500 text-white border border-red-700 rounded">
                                    {pendingCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    <Chip tone="amber" icon="🔥">
                        14일
                    </Chip>
                    <CharBox name="유" color="#f59e0b" size={32} level={12} />
                    <div className="text-[12px] font-extrabold">
                        길드장{" "}
                        <span className="text-stone-500 font-normal">
                            · Admin
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-[300px_1fr_380px] overflow-hidden">
                {/* LEFT — 신청자 목록 */}
                <div className="border-r-2 border-stone-200 bg-stone-50 flex flex-col">
                    <div className="p-4 pb-2">
                        <div className="flex justify-between items-baseline mb-2">
                            <h2 className="text-[16px] font-black tracking-tight flex items-center gap-1.5">
                                📜 가입 신청서
                            </h2>
                            <span className="text-[11px] font-mono-auth font-extrabold text-stone-500">
                                {list.length} / {players.length}
                            </span>
                        </div>
                        <AuthField
                            placeholder="이름 또는 이메일"
                            icon={Icons.search()}
                            value={search}
                            onChange={setSearch}
                        />
                        <div className="flex gap-1 mt-2 p-1 bg-white rounded-md border-2 border-stone-200">
                            {[
                                { k: "all" as const, l: "전체" },
                                { k: "today" as const, l: "오늘" },
                                {
                                    k: "risk" as const,
                                    l: "주의",
                                    count: riskCount,
                                },
                            ].map((f) => (
                                <button
                                    key={f.k}
                                    onClick={() => setFilter(f.k)}
                                    className={`flex-1 px-2 py-1.5 text-[12px] font-extrabold rounded-sm transition-colors flex items-center justify-center gap-1.5 ${filter === f.k ? "bg-amber-400 text-amber-950 border-2 border-amber-700 shadow-[0_2px_0_0_#b45309]" : "text-stone-500 hover:text-stone-700 border-2 border-transparent"}`}
                                >
                                    {f.l}
                                    {f.count !== undefined && f.count > 0 && (
                                        <span className="text-[10px] bg-red-500 text-white px-1.5 rounded font-black border border-red-700">
                                            {f.count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto px-3 pb-4 pt-1">
                        {loading && (
                            <div className="text-[12px] text-stone-400 px-2 py-3">
                                불러오는 중…
                            </div>
                        )}
                        {loadErr && (
                            <div className="text-[12px] text-red-600 px-2 py-3">
                                ⚠ {loadErr}
                            </div>
                        )}
                        {!loading && !loadErr && list.length === 0 && (
                            <div className="text-[12px] text-stone-400 px-2 py-3">
                                대기 중인 신청자가 없어요.
                            </div>
                        )}
                        {list.map((p) => {
                            const isSel = selected === p.id;
                            const team = p.team_id
                                ? teamById.get(p.team_id)
                                : null;
                            const isRisk =
                                !p.email.endsWith("@ud2.co") &&
                                !p.email.endsWith("@example.com");
                            return (
                                <div
                                    key={p.id}
                                    onClick={() => setSelected(p.id)}
                                    className={`p-2.5 rounded-md cursor-pointer mb-1.5 flex gap-2.5 items-center transition-all border-2 ${isSel ? "bg-white border-amber-400 shadow-[0_2px_0_0_#b45309]" : "border-transparent hover:bg-white/70 hover:border-stone-200"}`}
                                >
                                    <CharBox
                                        name={p.name}
                                        color={
                                            isRisk ? "#ef4444" : "#0ea5e9"
                                        }
                                        size={36}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1 flex-wrap">
                                            <div className="text-[13px] font-extrabold text-stone-900 truncate">
                                                {p.name}
                                            </div>
                                            {isRisk && (
                                                <Chip tone="red">주의</Chip>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-stone-500 truncate flex items-center gap-1">
                                            <span className="text-[11px]">
                                                {team?.icon ?? "🏰"}
                                            </span>
                                            <span className="font-bold">
                                                {team?.name ?? "—"}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-stone-400 font-mono-auth font-bold whitespace-nowrap">
                                        {elapsedLabel(p.created_at)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* CENTER — 상세 */}
                <div className="overflow-auto relative">
                    {!cur && !loading && (
                        <div className="p-12 text-center text-[13px] text-stone-400">
                            왼쪽에서 신청자를 선택해주세요.
                        </div>
                    )}
                    {cur && (
                        <div className="p-7 pb-24">
                            <div className="flex items-center gap-2 mb-4 text-[11px] text-stone-400 font-mono-auth font-bold">
                                <span>
                                    #UD2-{String(cur.id).padStart(5, "0")}
                                </span>
                                <span>·</span>
                                <span>
                                    {elapsedLabel(cur.created_at)} 신청
                                </span>
                            </div>

                            <div
                                className="rounded-xl border-2 border-stone-800 p-6 mb-5 bg-gradient-to-br from-amber-50 via-white to-white"
                                style={{ boxShadow: "0 6px 0 0 #1c1917" }}
                            >
                                <div className="flex gap-5 items-start">
                                    <div className="relative">
                                        <CharBox
                                            name={cur.name}
                                            size={84}
                                            color={
                                                isExternal
                                                    ? "#ef4444"
                                                    : "#0ea5e9"
                                            }
                                        />
                                        <div className="absolute -top-3 -left-3 bg-stone-100 border-2 border-stone-400 rounded text-[9px] font-black text-stone-600 px-1.5 py-0.5 font-mono-auth">
                                            NEW
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-[10px] font-mono-auth font-extrabold text-stone-400 tracking-widest">
                                            APPLICANT
                                        </div>
                                        <div className="text-[26px] font-black tracking-tight leading-tight mt-0.5">
                                            {cur.name}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                            {curTeam && (
                                                <Chip
                                                    tone="amber"
                                                    icon={curTeam.icon ?? "🏰"}
                                                >
                                                    {curTeam.name}
                                                </Chip>
                                            )}
                                            <Chip tone="gray" icon="🌱">
                                                Lv. 0 지망생
                                            </Chip>
                                            {isExternal && (
                                                <Chip tone="red">
                                                    외부 도메인
                                                </Chip>
                                            )}
                                        </div>
                                        <div className="text-[12px] text-stone-500 font-mono-auth font-bold mt-1.5">
                                            {cur.email}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {cur.bio && (
                                <div className="mb-5">
                                    <div className="text-[11px] text-stone-700 font-extrabold mb-2 tracking-widest flex items-center gap-1.5">
                                        📝 각오 한마디
                                        <Chip tone="gray">🛡️ 길드장 전용</Chip>
                                    </div>
                                    <div className="p-4 rounded-md bg-amber-50 border-2 border-amber-300 text-[14px] text-stone-800 leading-relaxed font-medium">
                                        &ldquo;{cur.bio}&rdquo;
                                    </div>
                                </div>
                            )}

                            <div className="mb-5">
                                <div className="text-[11px] text-stone-700 font-extrabold mb-2 tracking-widest flex items-center gap-1.5">
                                    🛡️ 자동 보안 검증
                                </div>
                                <div className="rounded-md bg-white border-2 border-stone-300 divide-y-2 divide-stone-100">
                                    <SecurityRow
                                        ok={!isExternal}
                                        label="회사 도메인 (@ud2.co)"
                                        detail={
                                            isExternal
                                                ? "외부 도메인 — 신중히 검토 필요"
                                                : "확인됨"
                                        }
                                    />
                                    <SecurityRow
                                        ok
                                        label="유효한 초대코드 사용"
                                        detail="가입 시 1회용 코드 소진 확인됨"
                                    />
                                    <SecurityRow
                                        ok
                                        label="신청 시각"
                                        detail={new Date(
                                            cur.created_at,
                                        ).toLocaleString("ko-KR")}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 액션 바 */}
                    {cur && (
                        <div className="absolute bottom-0 left-0 right-0 px-7 py-4 bg-white border-t-2 border-stone-300 flex items-center gap-2">
                            <GameButton
                                variant="danger"
                                size="md"
                                onClick={() => setConfirm("rejected")}
                                leftIcon="🚫"
                            >
                                입장 거부
                            </GameButton>
                            <div className="flex-1" />
                            <span className="text-[11px] text-stone-400 mr-2 font-mono-auth font-bold">
                                ⌘ + ↵ 빠른 승인
                            </span>
                            <GameButton
                                variant="success"
                                size="md"
                                onClick={() => setConfirm("approved")}
                                leftIcon="🎉"
                            >
                                입장 허가
                            </GameButton>
                        </div>
                    )}

                    {confirm && cur && (
                        <div
                            className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm grid place-items-center p-6 z-10"
                            onClick={() => setConfirm(null)}
                        >
                            <div
                                onClick={(e) => e.stopPropagation()}
                                className="w-[440px] rounded-xl bg-white border-2 border-stone-800 overflow-hidden"
                                style={{ boxShadow: "0 8px 0 0 #1c1917" }}
                            >
                                <div
                                    className={`h-9 grid place-items-center border-b-2 border-stone-800 text-[11px] font-extrabold tracking-widest font-mono-auth ${confirm === "approved" ? "bg-emerald-400 text-emerald-950" : "bg-red-400 text-red-950"}`}
                                >
                                    ★{" "}
                                    {confirm === "approved"
                                        ? "ENTRY APPROVAL"
                                        : "ENTRY REJECTION"}{" "}
                                    ★
                                </div>
                                <div className="p-6">
                                    <div className="text-[44px] leading-none mb-3 text-center">
                                        {confirm === "approved" ? "🎉" : "🚫"}
                                    </div>
                                    <h3 className="text-[18px] font-black tracking-tight mb-1.5 text-center">
                                        {confirm === "approved"
                                            ? `${cur.name}님을 길드에 합류시킬까요?`
                                            : `${cur.name}님의 입장을 거부할까요?`}
                                    </h3>
                                    <p className="text-[13px] text-stone-500 leading-relaxed mb-5 text-center">
                                        {confirm === "approved"
                                            ? "승인 즉시 워크스페이스에 입장할 수 있어요."
                                            : "신청자에게는 ‘이전 가입 신청이 거부되었습니다.’ 메시지가 보여집니다."}
                                    </p>
                                    <div className="flex gap-2 justify-end">
                                        <GameButton
                                            variant="ghost"
                                            size="md"
                                            onClick={() => setConfirm(null)}
                                        >
                                            취소
                                        </GameButton>
                                        <GameButton
                                            variant={
                                                confirm === "approved"
                                                    ? "success"
                                                    : "danger"
                                            }
                                            size="md"
                                            disabled={acting}
                                            onClick={() => decide(confirm)}
                                        >
                                            {acting
                                                ? "처리 중…"
                                                : confirm === "approved"
                                                  ? "✓ 입장 허가"
                                                  : "✕ 입장 거부"}
                                        </GameButton>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT — 초대코드 패널 */}
                <div className="border-l-2 border-stone-200 bg-stone-50 flex flex-col overflow-hidden">
                    <div className="p-5 border-b-2 border-stone-200 bg-white">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-[13px] font-extrabold flex items-center gap-1.5">
                                <PixKey scale={2} /> 새 열쇠 발급
                            </div>
                            <Chip tone="amber">길드장 권한</Chip>
                        </div>

                        {newCode ? (
                            <div className="mb-1">
                                <div className="text-[10px] text-stone-400 font-mono-auth font-extrabold tracking-widest mb-1.5">
                                    ✓ NEW KEY ISSUED
                                </div>
                                <div
                                    className="p-3 bg-amber-50 border-2 border-amber-400 rounded-md flex items-center justify-between gap-2"
                                    style={{
                                        boxShadow: "0 3px 0 0 #b45309",
                                    }}
                                >
                                    <div className="text-[18px] font-black font-mono-auth tracking-[0.18em] text-amber-950">
                                        {formatCode(newCode.code)}
                                    </div>
                                    <button
                                        onClick={() =>
                                            void navigator.clipboard?.writeText(
                                                formatCode(newCode.code),
                                            )
                                        }
                                        className="text-[11px] font-extrabold text-amber-700 hover:text-amber-900 px-2 py-1 rounded border-2 border-amber-400 bg-white"
                                    >
                                        📋 복사
                                    </button>
                                </div>
                                <button
                                    onClick={() => setNewCode(null)}
                                    className="mt-2 text-[11px] font-bold text-stone-500 hover:text-stone-700"
                                >
                                    ↺ 다시 발급
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                <div>
                                    <div className="text-[11px] font-extrabold text-stone-600 mb-1">
                                        대상 팀
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {teams.map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() =>
                                                    setIssueTeam(t.id)
                                                }
                                                className={`px-2 py-1.5 rounded-md text-[11.5px] font-extrabold border-2 transition-all flex items-center justify-center gap-1 ${issueTeam === t.id ? "bg-amber-100 border-amber-500 text-amber-900 shadow-[0_2px_0_0_#b45309]" : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"}`}
                                            >
                                                <span>{t.icon ?? "🏰"}</span>
                                                {t.name.replace("팀", "")}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-[11px] font-extrabold text-stone-600 mb-1">
                                        유효 기간
                                    </div>
                                    <div className="flex gap-1.5">
                                        {(
                                            [
                                                { k: "1", l: "1일" },
                                                { k: "7", l: "7일" },
                                                { k: "30", l: "30일" },
                                            ] as const
                                        ).map((o) => (
                                            <button
                                                key={o.k}
                                                onClick={() =>
                                                    setIssueExpiry(o.k)
                                                }
                                                className={`flex-1 px-2 py-1.5 rounded-md text-[12px] font-extrabold border-2 transition-all ${issueExpiry === o.k ? "bg-amber-100 border-amber-500 text-amber-900 shadow-[0_2px_0_0_#b45309]" : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"}`}
                                            >
                                                {o.l}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <GameButton
                                    variant="primary"
                                    size="md"
                                    full
                                    disabled={!issueTeam || issuing}
                                    onClick={issueNew}
                                >
                                    {issuing
                                        ? "발급 중…"
                                        : "✨ 새 열쇠 만들기"}
                                </GameButton>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-auto px-4 pb-4">
                        <div className="sticky top-0 bg-stone-50 pt-4 pb-2 z-[1]">
                            <div className="text-[11px] text-stone-700 font-extrabold mb-2 tracking-widest flex items-center justify-between">
                                <span>📜 발급된 열쇠</span>
                                <span className="font-mono-auth text-stone-400">
                                    {invitations.length}건
                                </span>
                            </div>
                            <div className="flex gap-1 p-1 bg-white rounded-md border-2 border-stone-200">
                                {(
                                    [
                                        { k: "active", l: "사용 가능" },
                                        { k: "used", l: "사용됨" },
                                        { k: "expired", l: "만료" },
                                    ] as const
                                ).map((f) => (
                                    <button
                                        key={f.k}
                                        onClick={() => setCodeFilter(f.k)}
                                        className={`flex-1 px-1.5 py-1 text-[11px] font-extrabold rounded-sm transition-colors flex items-center justify-center gap-1 ${codeFilter === f.k ? "bg-amber-400 text-amber-950 border border-amber-700" : "text-stone-500 hover:text-stone-700 border border-transparent"}`}
                                    >
                                        {f.l}{" "}
                                        <span className="text-[9px] font-mono-auth opacity-70">
                                            {codeCounts[f.k]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            {filteredCodes.map((c) => {
                                const team = c.team_id
                                    ? teamById.get(c.team_id)
                                    : null;
                                const expired =
                                    !c.used && c.expires_at <= nowIso;
                                return (
                                    <div
                                        key={c.id}
                                        className={`p-2.5 rounded-md bg-white border-2 transition-all ${c.used ? "border-emerald-200 opacity-70" : expired ? "border-stone-200 opacity-60" : "border-stone-300 hover:border-amber-400"}`}
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="text-[13px] font-black font-mono-auth tracking-[0.15em] text-stone-900">
                                                {formatCode(c.code)}
                                            </div>
                                            {c.used ? (
                                                <Chip tone="green">
                                                    사용됨
                                                </Chip>
                                            ) : expired ? (
                                                <Chip tone="gray">만료</Chip>
                                            ) : (
                                                <Chip tone="amber">대기</Chip>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] text-stone-500 font-mono-auth font-bold">
                                            <div className="flex items-center gap-1">
                                                <span className="text-[12px] leading-none">
                                                    {team?.icon ?? "🏰"}
                                                </span>
                                                <span>
                                                    {team?.name ?? "—"}
                                                </span>
                                            </div>
                                            <span>
                                                {c.used && c.used_by
                                                    ? `← ${c.used_by}`
                                                    : `~${c.expires_at.slice(2, 10)}`}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredCodes.length === 0 && (
                                <div className="py-8 text-center text-[12px] text-stone-400 font-bold">
                                    해당 상태의 열쇠가 없어요
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SecurityRow({
    ok,
    label,
    detail,
}: {
    ok: boolean;
    label: string;
    detail: string;
}) {
    return (
        <div className="flex gap-2.5 items-start py-2.5 px-3.5">
            <div
                className={`w-5 h-5 rounded grid place-items-center flex-shrink-0 mt-0.5 border-2 font-black text-[11px] ${ok ? "bg-emerald-100 text-emerald-700 border-emerald-500" : "bg-red-100 text-red-700 border-red-500"}`}
            >
                {ok ? "✓" : "✕"}
            </div>
            <div className="flex-1">
                <div
                    className={`text-[13px] font-extrabold ${ok ? "text-stone-900" : "text-red-700"}`}
                >
                    {label}
                </div>
                <div className="text-[12px] text-stone-500 mt-0.5">
                    {detail}
                </div>
            </div>
        </div>
    );
}
