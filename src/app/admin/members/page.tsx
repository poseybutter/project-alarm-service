"use client";

import { useEffect, useMemo, useState } from "react";
import { GameButton } from "@/components/auth/GameButton";
import { AuthField } from "@/components/auth/AuthField";
import { Shield } from "@/components/auth/Pix";
import {
    AuthLogo,
    CharBox,
    Chip,
    Icons,
} from "@/components/auth/atoms";

type PendingMember = {
    id: number | string;
    name: string;
    email: string;
    invitedBy?: string;
    role?: string;
    appliedAt?: string;
    elapsed?: string;
    code?: string;
    note?: string | null;
    risk?: "low" | "high";
    domain?: boolean;
    status?: "pending" | "active" | "rejected";
};

type FilterKey = "all" | "today" | "risk";

const SPRING_BASE =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function AdminMembersPage() {
    const [members, setMembers] = useState<PendingMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadErr, setLoadErr] = useState<string | null>(null);

    const [filter, setFilter] = useState<FilterKey>("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<number | string | null>(null);
    const [decided, setDecided] = useState<
        Record<string, "approved" | "rejected">
    >({});
    const [confirm, setConfirm] = useState<"approved" | "rejected" | null>(
        null,
    );
    const [acting, setActing] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setLoadErr(null);
            try {
                const res = await fetch(`${SPRING_BASE}/api/admin/players`, {
                    credentials: "include",
                });
                if (!res.ok) throw new Error(`status ${res.status}`);
                const data = await res.json();
                const list: PendingMember[] = Array.isArray(data)
                    ? data
                    : Array.isArray(data?.members)
                      ? data.members
                      : [];
                if (!cancelled) {
                    setMembers(list);
                    if (list.length > 0 && selected == null) {
                        setSelected(list[0].id);
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    const message =
                        err instanceof Error
                            ? err.message
                            : "신청자 목록을 불러오지 못했어요";
                    setLoadErr(message);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
        // selected는 의도적으로 의존성에서 제외 (최초 1회 로딩만)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const list = useMemo(() => {
        return members.filter((p) => {
            if (filter === "risk" && p.risk !== "high") return false;
            if (
                filter === "today" &&
                !(p.appliedAt?.startsWith("오늘") ?? false)
            )
                return false;
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
    }, [members, filter, search]);

    const cur = members.find((p) => p.id === selected) || null;
    const curStatus = cur ? decided[String(cur.id)] : undefined;

    async function decide(action: "approved" | "rejected") {
        if (!cur || acting) return;
        setActing(true);
        try {
            const res = await fetch(
                `${SPRING_BASE}/api/admin/players/${cur.id}`,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        status: action === "approved" ? "active" : "rejected",
                    }),
                },
            );
            if (!res.ok) {
                alert("처리에 실패했어요. 잠시 후 다시 시도해주세요.");
                return;
            }
            setDecided((d) => ({ ...d, [String(cur.id)]: action }));
            setConfirm(null);
        } catch {
            alert("네트워크 오류가 발생했어요.");
        } finally {
            setActing(false);
        }
    }

    const pendingCount = members.filter(
        (m) => !decided[String(m.id)],
    ).length;
    const riskCount = members.filter((p) => p.risk === "high").length;

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
                        김유정{" "}
                        <span className="text-stone-500 font-normal">
                            · 길드장
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-[320px_1fr_360px] overflow-hidden">
                {/* LEFT — 목록 */}
                <div className="border-r-2 border-stone-200 bg-stone-50 flex flex-col">
                    <div className="p-4 pb-2">
                        <div className="flex justify-between items-baseline mb-2">
                            <h2 className="text-[16px] font-black tracking-tight flex items-center gap-1.5">
                                📜 가입 신청서
                            </h2>
                            <span className="text-[11px] font-mono-auth font-extrabold text-stone-500">
                                {list.length} / {members.length}
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
                        {!loading && list.length === 0 && !loadErr && (
                            <div className="text-[12px] text-stone-400 px-2 py-3">
                                조건에 맞는 신청자가 없어요.
                            </div>
                        )}
                        {list.map((p) => {
                            const st = decided[String(p.id)];
                            const isSel = selected === p.id;
                            return (
                                <div
                                    key={p.id}
                                    onClick={() => setSelected(p.id)}
                                    className={`p-2.5 rounded-md cursor-pointer mb-1.5 flex gap-2.5 items-center transition-all border-2 ${isSel ? "bg-white border-amber-400 shadow-[0_2px_0_0_#b45309]" : "border-transparent hover:bg-white/70 hover:border-stone-200"} ${st ? "opacity-60" : ""}`}
                                >
                                    <CharBox
                                        name={p.name}
                                        color={
                                            p.risk === "high"
                                                ? "#ef4444"
                                                : "#0ea5e9"
                                        }
                                        size={36}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <div className="text-[13px] font-extrabold text-stone-900 truncate">
                                                {p.name}
                                            </div>
                                            {p.risk === "high" && (
                                                <Chip tone="red">주의</Chip>
                                            )}
                                            {st === "approved" && (
                                                <Chip tone="green">입장</Chip>
                                            )}
                                            {st === "rejected" && (
                                                <Chip tone="gray">거부</Chip>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-stone-500 font-mono-auth truncate">
                                            {p.email}
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-stone-400 font-mono-auth font-bold whitespace-nowrap">
                                        {p.elapsed ?? "—"}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* CENTER — 상세 */}
                <div className="overflow-auto relative">
                    {cur && (
                        <div className="p-7 pb-24">
                            <div className="flex items-center gap-2 mb-4 text-[11px] text-stone-400 font-mono-auth font-bold">
                                <span>
                                    #UD2-{String(cur.id).padStart(5, "0")}
                                </span>
                                <span>·</span>
                                <span>
                                    {cur.appliedAt ?? "—"} 신청 (
                                    {cur.elapsed ?? "—"})
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
                                                cur.risk === "high"
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
                                            <Chip tone="gray" icon="🌱">
                                                Lv. 0 모험가 지망생
                                            </Chip>
                                            <span className="text-[12px] text-stone-500 font-mono-auth font-bold">
                                                {cur.email}
                                            </span>
                                            {cur.domain === false && (
                                                <Chip tone="red">
                                                    외부 도메인
                                                </Chip>
                                            )}
                                        </div>
                                    </div>

                                    {curStatus && (
                                        <div
                                            className={`px-3 py-1.5 rounded-md text-[12px] font-black border-2 ${curStatus === "approved" ? "bg-emerald-100 text-emerald-800 border-emerald-500" : "bg-stone-100 text-stone-600 border-stone-400"}`}
                                        >
                                            {curStatus === "approved"
                                                ? "✓ 입장 허가됨"
                                                : "✕ 입장 거부됨"}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-5 pt-4 border-t-2 border-dashed border-stone-200 grid grid-cols-3 gap-4">
                                    <Meta
                                        label="희망 역할"
                                        value={cur.role ?? "—"}
                                    />
                                    <Meta
                                        label="추천인"
                                        value={
                                            <span className="flex items-center gap-1.5">
                                                {cur.invitedBy && (
                                                    <CharBox
                                                        name={cur.invitedBy.slice(
                                                            0,
                                                            1,
                                                        )}
                                                        size={18}
                                                        color="#f59e0b"
                                                    />
                                                )}
                                                {cur.invitedBy ?? "—"}
                                            </span>
                                        }
                                    />
                                    <Meta
                                        label="사용한 열쇠"
                                        value={
                                            <span className="font-mono-auth font-bold">
                                                {cur.code ?? "—"}
                                            </span>
                                        }
                                    />
                                </div>
                            </div>

                            {cur.note && (
                                <div className="mb-5">
                                    <div className="text-[11px] text-stone-700 font-extrabold mb-2 tracking-widest flex items-center gap-1.5">
                                        📜 신청 메시지
                                    </div>
                                    <div className="p-4 rounded-md bg-amber-50 border-2 border-amber-300 text-[14px] text-stone-800 leading-relaxed font-medium">
                                        &ldquo;{cur.note}&rdquo;
                                    </div>
                                </div>
                            )}

                            <div className="mb-5">
                                <div className="text-[11px] text-stone-700 font-extrabold mb-2 tracking-widest flex items-center gap-1.5">
                                    🛡️ 자동 보안 검증
                                </div>
                                <div className="rounded-md bg-white border-2 border-stone-300 divide-y-2 divide-stone-100">
                                    <SecurityRow
                                        ok={cur.domain !== false}
                                        label="회사 도메인 (@ud2.co)"
                                        detail={
                                            cur.domain !== false
                                                ? "확인됨"
                                                : "외부 도메인 — 신중히 검토 필요"
                                        }
                                    />
                                    <SecurityRow
                                        ok
                                        label="유효한 열쇠 코드"
                                        detail={`${cur.invitedBy ?? "—"} 발급 · 만료 전`}
                                    />
                                    <SecurityRow
                                        ok
                                        label="신청 IP"
                                        detail="한국, 서울 · 차단 이력 없음"
                                    />
                                    <SecurityRow
                                        ok={cur.risk !== "high"}
                                        label="중복 신청 없음"
                                        detail={
                                            cur.risk !== "high"
                                                ? "확인됨"
                                                : "동일 이메일 2회 시도 — 이전 거절 이력"
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {!cur && !loading && (
                        <div className="p-12 text-center text-[13px] text-stone-400">
                            왼쪽에서 신청자를 선택해주세요.
                        </div>
                    )}

                    {cur && !curStatus && (
                        <div className="absolute bottom-0 left-0 right-0 px-7 py-4 bg-white border-t-2 border-stone-300 flex items-center gap-2">
                            <GameButton
                                variant="danger"
                                size="md"
                                onClick={() => setConfirm("rejected")}
                                leftIcon="🚫"
                            >
                                입장 거부
                            </GameButton>
                            <GameButton variant="ghost" size="md">
                                ⏰ 나중에
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
                    {cur && curStatus && (
                        <div className="absolute bottom-0 left-0 right-0 px-7 py-4 bg-white border-t-2 border-stone-300 flex items-center justify-between">
                            <div
                                className={`text-[13px] font-extrabold ${curStatus === "approved" ? "text-emerald-700" : "text-stone-600"}`}
                            >
                                {curStatus === "approved"
                                    ? `🎉 ${cur.name}님이 길드에 입장했어요. 환영 알림이 발송되었습니다.`
                                    : `🚫 ${cur.name}님의 입장을 거부했어요. 신청자에게 알림이 발송됩니다.`}
                            </div>
                            <GameButton
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    const d = { ...decided };
                                    delete d[String(cur.id)];
                                    setDecided(d);
                                }}
                            >
                                ↩ 되돌리기
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
                                            ? "승인 즉시 워크스페이스에 입장하고, 모든 길드원에게 합류 알림이 갑니다."
                                            : "신청자에게 거부 알림이 발송되며, 같은 이메일로는 30일 동안 재신청할 수 없어요."}
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

                {/* RIGHT — 감사 로그 */}
                <div className="border-l-2 border-stone-200 bg-stone-50 p-5 overflow-auto">
                    <div className="text-[11px] text-stone-700 font-extrabold mb-4 tracking-widest flex items-center gap-1.5">
                        📋 감사 로그 · TIMELINE
                    </div>
                    {!cur && (
                        <div className="text-[12px] text-stone-400">
                            신청자를 선택하면 감사 로그가 표시됩니다.
                        </div>
                    )}
                    {cur && (
                        <>
                            <div className="relative pl-5">
                                <div className="absolute top-2 bottom-2 left-[5px] w-0.5 bg-stone-300" />
                                {[
                                    {
                                        t: "가입 신청서 접수",
                                        d: `${cur.appliedAt ?? "—"} · IP 218.55.x.x`,
                                        n: `${cur.name}님이 비밀 열쇠로 가입 신청`,
                                    },
                                    {
                                        t: "초대장 열람",
                                        d: "오늘 14:08",
                                        n: "신청자가 초대 링크 클릭 — 6분 후 가입 시도",
                                    },
                                    {
                                        t: "초대 이메일 발송",
                                        d: "어제 09:15",
                                        n: `${cur.email}로 자동 발송됨`,
                                    },
                                    {
                                        t: "열쇠 발급",
                                        d: "어제 09:14",
                                        n: `${cur.invitedBy ?? "—"} · 5회 사용 가능 · ${cur.code ?? "—"}`,
                                    },
                                ].map((ev) => (
                                    <div
                                        key={ev.t}
                                        className="mb-4 relative"
                                    >
                                        <div className="absolute -left-5 top-1 w-3 h-3 bg-white border-2 border-amber-500" />
                                        <div className="text-[13px] font-extrabold text-stone-900">
                                            {ev.t}
                                        </div>
                                        <div className="text-[10px] text-stone-500 font-mono-auth font-bold mt-0.5">
                                            {ev.d}
                                        </div>
                                        <div className="text-[12px] text-stone-600 mt-1 leading-relaxed">
                                            {ev.n}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-2 p-4 rounded-md bg-amber-50 border-2 border-amber-400">
                                <div className="text-[11px] text-amber-700 font-extrabold mb-2 tracking-widest">
                                    💡 추천 판정
                                </div>
                                <div className="text-[13px] text-stone-800 leading-relaxed mb-3 font-medium">
                                    {cur.domain !== false
                                        ? "회사 도메인 + 길드장 직접 발급 열쇠 → 일반적으로 입장 허가 권장"
                                        : "외부 도메인 신청 → 추천인에게 1차 확인 후 결정 권장"}
                                </div>
                                <GameButton
                                    variant="soft"
                                    size="sm"
                                    full
                                >
                                    📣 {cur.invitedBy ?? "추천인"}에게 슬랙 확인
                                </GameButton>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Meta({
    label,
    value,
}: {
    label: string;
    value: React.ReactNode;
}) {
    return (
        <div>
            <div className="text-[10px] text-stone-400 font-mono-auth font-extrabold mb-1 tracking-widest">
                {label}
            </div>
            <div className="text-[13px] font-extrabold">{value}</div>
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
