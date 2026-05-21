"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GameButton } from "@/components/auth/GameButton";
import { AuthField } from "@/components/auth/AuthField";
import { Shield } from "@/components/auth/Pix";
import { AuthLogo, CharBox, Chip, Icons } from "@/components/auth/atoms";

type Team = { id: string; name: string; icon: string | null };

export default function AdminSettingsPage() {
    const router = useRouter();
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadErr, setLoadErr] = useState<string | null>(null);

    // 추가 폼
    const [newId, setNewId] = useState("");
    const [newName, setNewName] = useState("");
    const [newIcon, setNewIcon] = useState("");
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);

    // 삭제 확인
    const [confirmDel, setConfirmDel] = useState<Team | null>(null);
    const [deleting, setDeleting] = useState(false);

    const reload = useCallback(async () => {
        setLoadErr(null);
        try {
            const res = await fetch("/api/teams");
            if (!res.ok) throw new Error("load failed");
            const data = (await res.json()) as Team[];
            setTeams(Array.isArray(data) ? data : []);
        } catch {
            setLoadErr("팀 목록을 불러오지 못했어요.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    async function createTeam() {
        if (creating) return;
        setCreating(true);
        setCreateErr(null);
        try {
            const res = await fetch("/api/admin/teams", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: newId,
                    name: newName,
                    icon: newIcon || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setCreateErr(data.message ?? "팀 생성에 실패했어요.");
                return;
            }
            setNewId("");
            setNewName("");
            setNewIcon("");
            await reload();
        } catch {
            setCreateErr("네트워크 오류가 발생했어요.");
        } finally {
            setCreating(false);
        }
    }

    async function deleteTeam(team: Team) {
        if (deleting) return;
        setDeleting(true);
        try {
            const res = await fetch(
                `/api/admin/teams/${encodeURIComponent(team.id)}`,
                { method: "DELETE" },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.message ?? "팀 삭제에 실패했어요.");
                return;
            }
            setConfirmDel(null);
            await reload();
        } catch {
            alert("네트워크 오류가 발생했어요.");
        } finally {
            setDeleting(false);
        }
    }

    const idValid = /^[a-z0-9_-]{1,32}$/.test(newId);
    const nameValid = newName.trim().length > 0 && newName.length <= 64;
    const canCreate = idValid && nameValid && !creating;

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
                                길드 설정
                            </div>
                            <div className="text-[10px] text-amber-700 font-mono-auth font-extrabold tracking-widest">
                                GUILD MASTER · SETTINGS
                            </div>
                        </div>
                    </div>
                    <div className="w-px h-6 bg-stone-300 ml-2" />
                    {[
                        { t: "📊 대시보드", active: false, href: null },
                        { t: "📜 퀘스트", active: false, href: null },
                        {
                            t: "🛡️ 길드원",
                            active: false,
                            href: "/admin/members",
                        },
                        {
                            t: "⚙️ 설정",
                            active: true,
                            href: "/admin/settings",
                        },
                    ].map((m) => (
                        <button
                            key={m.t}
                            onClick={() => m.href && router.push(m.href)}
                            disabled={!m.href}
                            className={`text-[12px] px-2.5 py-1.5 rounded-md font-extrabold transition-colors border-2 ${m.active ? "bg-white border-stone-800 text-stone-900" : "border-transparent text-stone-500 hover:bg-amber-100"} ${!m.href ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                            {m.t}
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

            {/* CONTENT */}
            <div className="overflow-auto">
                <div className="max-w-3xl mx-auto px-8 py-10">
                    <div className="mb-2 text-[11px] text-amber-700 font-extrabold tracking-widest font-mono-auth">
                        SETTINGS · TEAM MANAGEMENT
                    </div>
                    <h1 className="text-[26px] font-black tracking-tight">
                        팀 관리
                    </h1>
                    <p className="text-[13px] text-stone-500 mt-1.5 mb-8">
                        길드원이 소속될 팀과 초대코드 발급 대상 팀을 관리해요.
                    </p>

                    {/* 추가 폼 */}
                    <div
                        className="rounded-xl border-2 border-stone-800 bg-white p-6 mb-8"
                        style={{ boxShadow: "0 6px 0 0 #1c1917" }}
                    >
                        <div className="flex items-center gap-1.5 text-[13px] font-extrabold mb-4">
                            ✨ 새 팀 추가
                        </div>
                        <div className="grid grid-cols-[120px_1fr_160px] gap-3">
                            <AuthField
                                label="이모지"
                                placeholder="🎨"
                                value={newIcon}
                                onChange={setNewIcon}
                                maxLength={4}
                            />
                            <AuthField
                                label={
                                    <span>
                                        팀 이름{" "}
                                        <span className="text-red-500">*</span>
                                    </span>
                                }
                                placeholder="퍼블리싱팀"
                                value={newName}
                                onChange={setNewName}
                                maxLength={64}
                                hint={
                                    nameValid ? (
                                        <span className="text-emerald-600 font-bold">
                                            ✓
                                        </span>
                                    ) : (
                                        "1~64자"
                                    )
                                }
                            />
                            <AuthField
                                label={
                                    <span>
                                        팀 ID{" "}
                                        <span className="text-red-500">*</span>
                                    </span>
                                }
                                placeholder="publishing"
                                value={newId}
                                onChange={(v) =>
                                    setNewId(
                                        v
                                            .toLowerCase()
                                            .replace(/[^a-z0-9_-]/g, ""),
                                    )
                                }
                                maxLength={32}
                                mono
                                hint={
                                    idValid ? (
                                        <span className="text-emerald-600 font-bold">
                                            ✓
                                        </span>
                                    ) : (
                                        "a-z 0-9 - _"
                                    )
                                }
                            />
                        </div>

                        {createErr && (
                            <div className="mt-4 p-3 bg-red-50 border-2 border-red-300 rounded-md text-[13px] text-red-700 font-bold">
                                ⚠ {createErr}
                            </div>
                        )}

                        <div className="mt-5 flex justify-end">
                            <GameButton
                                variant="primary"
                                size="md"
                                disabled={!canCreate}
                                onClick={createTeam}
                                leftIcon={Icons.check(14)}
                            >
                                {creating ? "추가 중…" : "팀 추가"}
                            </GameButton>
                        </div>
                    </div>

                    {/* 팀 목록 */}
                    <div className="text-[11px] text-stone-700 font-extrabold mb-3 tracking-widest flex items-center justify-between">
                        <span>📜 등록된 팀</span>
                        <span className="font-mono-auth text-stone-400">
                            {teams.length}건
                        </span>
                    </div>

                    {loading && (
                        <div className="text-[13px] text-stone-400 py-6 text-center">
                            불러오는 중…
                        </div>
                    )}
                    {loadErr && (
                        <div className="text-[13px] text-red-600 py-6 text-center">
                            ⚠ {loadErr}
                        </div>
                    )}
                    {!loading && !loadErr && teams.length === 0 && (
                        <div className="text-[13px] text-stone-400 py-6 text-center">
                            등록된 팀이 없어요. 위에서 추가해 보세요.
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {teams.map((t) => (
                            <div
                                key={t.id}
                                className="p-4 rounded-md bg-white border-2 border-stone-300 flex items-center gap-3"
                            >
                                <div className="text-[28px] leading-none flex-shrink-0">
                                    {t.icon ?? "🏰"}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[14px] font-extrabold truncate">
                                        {t.name}
                                    </div>
                                    <div className="text-[11px] text-stone-500 font-mono-auth font-bold mt-0.5 truncate">
                                        {t.id}
                                    </div>
                                </div>
                                <GameButton
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setConfirmDel(t)}
                                >
                                    🗑 삭제
                                </GameButton>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 삭제 확인 모달 */}
            {confirmDel && (
                <div
                    className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm grid place-items-center px-4"
                    onClick={() => !deleting && setConfirmDel(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-md bg-white border-2 border-stone-800 rounded-xl overflow-hidden"
                        style={{ boxShadow: "0 8px 0 0 #1c1917" }}
                    >
                        <div className="h-9 bg-red-400 border-b-2 border-stone-800 grid place-items-center">
                            <div className="text-[11px] font-extrabold text-red-950 tracking-widest font-mono-auth">
                                ★ DELETE TEAM ★
                            </div>
                        </div>
                        <div className="p-6 text-center">
                            <div className="text-[44px] leading-none mb-3">
                                {confirmDel.icon ?? "🏰"}
                            </div>
                            <h3 className="text-[18px] font-black tracking-tight mb-1.5">
                                &lsquo;{confirmDel.name}&rsquo; 팀을 삭제할까요?
                            </h3>
                            <p className="text-[13px] text-stone-500 leading-relaxed mb-5">
                                팀에 소속된 멤버나 발급된 초대코드가 있으면 삭제가
                                거부돼요.
                            </p>
                            <div className="flex gap-2 justify-end">
                                <GameButton
                                    variant="ghost"
                                    size="md"
                                    onClick={() => setConfirmDel(null)}
                                    disabled={deleting}
                                >
                                    취소
                                </GameButton>
                                <GameButton
                                    variant="danger"
                                    size="md"
                                    onClick={() => deleteTeam(confirmDel)}
                                    disabled={deleting}
                                >
                                    {deleting ? "삭제 중…" : "✕ 삭제"}
                                </GameButton>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
