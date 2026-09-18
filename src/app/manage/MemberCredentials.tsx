"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import {
    useMemberCredentials,
    type MemberWithCredentials,
} from "./useMemberCredentials";

function formatRelative(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "방금";
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}시간 전`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}일 전`;
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

type Props = {
    teamId: string | null;
    isAdmin: boolean;
    totpVerified: boolean;
    totpToken: string;
    onTotpRequired: (callback: () => void) => void;
};

export default function MemberCredentials({
    teamId,
    isAdmin,
    totpVerified,
    totpToken,
    onTotpRequired,
}: Props) {
    const mc = useMemberCredentials(teamId);
    const [members, setMembers] = useState<MemberWithCredentials[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [revealed, setRevealed] = useState<Record<number, string>>({});
    const [revealing, setRevealing] = useState<number | null>(null);

    // 추가 모달
    const [addOpen, setAddOpen] = useState(false);
    const [addProfileId, setAddProfileId] = useState("");
    const [addLabel, setAddLabel] = useState("Windows");
    const [addPassword, setAddPassword] = useState("");
    const [addNotes, setAddNotes] = useState("");
    const [addSaving, setAddSaving] = useState(false);

    // 수정 모달
    const [editId, setEditId] = useState<number | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editPassword, setEditPassword] = useState("");
    const [editNotes, setEditNotes] = useState("");
    const [editSaving, setEditSaving] = useState(false);

    useEffect(() => {
        if (!teamId) return;
        void mc.load().then((m) => {
            setMembers(m);
            setLoaded(true);
        });
    }, [teamId, mc]);

    const reload = async () => {
        const m = await mc.load();
        setMembers(m);
    };

    const handleReveal = async (credentialId: number) => {
        if (revealed[credentialId]) {
            setRevealed((p) => {
                const n = { ...p };
                delete n[credentialId];
                return n;
            });
            return;
        }

        const doReveal = async () => {
            setRevealing(credentialId);
            try {
                const pw = await mc.reveal(credentialId, totpToken || undefined);
                setRevealed((p) => ({ ...p, [credentialId]: pw }));
            } catch { /* handled */ }
            setRevealing(null);
        };

        if (!totpVerified) {
            onTotpRequired(() => void doReveal());
        } else {
            await doReveal();
        }
    };

    const handleAdd = async () => {
        if (!addProfileId || !addLabel.trim() || addSaving) return;
        setAddSaving(true);
        try {
            await mc.create(addProfileId, addLabel.trim(), addPassword.trim() || undefined, addNotes.trim() || undefined);
            setAddOpen(false);
            setAddLabel("Windows");
            setAddPassword("");
            setAddNotes("");
            setAddProfileId("");
            await reload();
        } finally {
            setAddSaving(false);
        }
    };

    const handleEdit = async () => {
        if (!editId || editSaving) return;
        setEditSaving(true);
        try {
            await mc.update(editId, {
                label: editLabel.trim() || undefined,
                password: editPassword || undefined,
                notes: editNotes,
            });
            setEditId(null);
            await reload();
        } finally {
            setEditSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        await mc.remove(id);
        await reload();
    };

    if (!loaded) return null;

    const hasAnyCredentials = members.some((m) => m.credentials.length > 0);
    if (!hasAnyCredentials && !isAdmin) return null;

    return (
        <>
            <div className="space-y-3">
                {isAdmin && (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setAddOpen(true)}
                            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition-colors"
                        >
                            + 계정 추가
                        </button>
                    </div>
                )}
                {members.filter((m) => m.credentials.length > 0 || isAdmin).map((member) => (
                    <div key={member.profileId} className="rounded-xl border border-stone-200 bg-white p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Avatar name={member.displayName} size={28} />
                            <div>
                                <span className="text-sm font-bold text-stone-700 block">{member.displayName}</span>
                                <span className="text-[10px] text-stone-400">{member.email}</span>
                            </div>
                        </div>
                        {member.credentials.length === 0 && (
                            <p className="text-xs text-stone-400">등록된 계정 없음</p>
                        )}
                        <div className="space-y-2">
                            {member.credentials.map((cred) => (
                                <div key={cred.id} className="flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2">
                                    <span className="text-xs font-bold text-stone-600 w-20 shrink-0">{cred.label}</span>
                                    {cred.hasPassword && (
                                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            {revealed[cred.id] ? (
                                                <>
                                                    <span className="text-xs text-stone-700 font-mono break-all">{revealed[cred.id]}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setRevealed((p) => { const n = { ...p }; delete n[cred.id]; return n; })}
                                                        className="text-[10px] text-stone-400 shrink-0"
                                                    >
                                                        숨기기
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-xs text-stone-400 tracking-widest">●●●●●●</span>
                                                    <button
                                                        type="button"
                                                        disabled={revealing === cred.id}
                                                        onClick={() => void handleReveal(cred.id)}
                                                        className="text-[10px] text-amber-500 font-medium disabled:opacity-50 shrink-0"
                                                    >
                                                        {revealing === cred.id ? "..." : "보기"}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    <span className="text-[10px] text-stone-400 shrink-0" title={cred.updatedAt ? new Date(cred.updatedAt).toLocaleString("ko-KR") : ""}>
                                        {cred.updatedAt ? formatRelative(cred.updatedAt) : ""}
                                    </span>
                                    {isAdmin && (
                                        <div className="ml-auto flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditId(cred.id);
                                                    setEditLabel(cred.label);
                                                    setEditPassword("");
                                                    setEditNotes(cred.notes ?? "");
                                                }}
                                                className="text-stone-300 hover:text-amber-500 transition-colors"
                                                aria-label="수정"
                                            >
                                                <i className="ri-pencil-line text-sm" aria-hidden />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleDelete(cred.id)}
                                                className="text-stone-300 hover:text-red-400 transition-colors"
                                                aria-label="삭제"
                                            >
                                                <i className="ri-close-line text-sm" aria-hidden />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* 추가 모달 */}
            {addOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setAddOpen(false)}>
                    <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-sm font-bold text-stone-800 mb-3">계정 정보 추가</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1">팀원</label>
                                <select
                                    value={addProfileId}
                                    onChange={(e) => setAddProfileId(e.target.value)}
                                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
                                    style={{ appearance: "auto" }}
                                >
                                    <option value="">선택</option>
                                    {members.map((m) => (
                                        <option key={m.profileId} value={m.profileId}>{m.displayName}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1">항목</label>
                                <input
                                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
                                    value={addLabel}
                                    onChange={(e) => setAddLabel(e.target.value)}
                                    placeholder="예: Windows, VPN"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1">비밀번호</label>
                                <input
                                    type="password"
                                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
                                    value={addPassword}
                                    onChange={(e) => setAddPassword(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1">메모</label>
                                <input
                                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
                                    value={addNotes}
                                    onChange={(e) => setAddNotes(e.target.value)}
                                    placeholder="선택사항"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                            <button
                                type="button"
                                disabled={!addProfileId || !addLabel.trim() || addSaving}
                                onClick={handleAdd}
                                className="flex-1 bg-amber-500 text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50"
                            >
                                {addSaving ? "저장 중..." : "추가"}
                            </button>
                            <button type="button" onClick={() => setAddOpen(false)} className="flex-1 border border-stone-200 text-stone-500 font-medium py-2 rounded-lg text-sm">
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 수정 모달 */}
            {editId && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setEditId(null)}>
                    <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-sm font-bold text-stone-800 mb-3">계정 정보 수정</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1">항목</label>
                                <input
                                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
                                    value={editLabel}
                                    onChange={(e) => setEditLabel(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1">비밀번호</label>
                                <input
                                    type="password"
                                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    placeholder="빈칸이면 기존 값 유지"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1">메모</label>
                                <input
                                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                            <button
                                type="button"
                                disabled={!editLabel.trim() || editSaving}
                                onClick={handleEdit}
                                className="flex-1 bg-amber-500 text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50"
                            >
                                {editSaving ? "저장 중..." : "저장"}
                            </button>
                            <button type="button" onClick={() => setEditId(null)} className="flex-1 border border-stone-200 text-stone-500 font-medium py-2 rounded-lg text-sm">
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
