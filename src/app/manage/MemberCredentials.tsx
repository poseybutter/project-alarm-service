"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import {
    useMemberCredentials,
    type MemberWithCredentials,
} from "./useMemberCredentials";

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
    const [addLabel, setAddLabel] = useState("Windows 계정");
    const [addLoginId, setAddLoginId] = useState("");
    const [addPassword, setAddPassword] = useState("");
    const [addNotes, setAddNotes] = useState("");
    const [addSaving, setAddSaving] = useState(false);

    // 수정 모달
    const [editId, setEditId] = useState<number | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editLoginId, setEditLoginId] = useState("");
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
            await mc.create(addProfileId, addLabel.trim(), addLoginId.trim() || undefined, addPassword.trim() || undefined, addNotes.trim() || undefined);
            setAddOpen(false);
            setAddLabel("Windows 계정");
            setAddLoginId("");
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
                loginId: editLoginId,
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
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <span className="text-sm font-bold text-stone-700">팀원 계정 정보</span>
                {isAdmin && (
                    <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="text-xs font-medium text-amber-500 hover:text-amber-600"
                    >
                        + 추가
                    </button>
                )}
            </div>
            <div className="px-4 pb-4 space-y-3">
                {members.filter((m) => m.credentials.length > 0 || isAdmin).map((member) => (
                    <div key={member.profileId} className="rounded-lg border border-stone-100 bg-stone-50/50 p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Avatar name={member.displayName} size={24} />
                            <span className="text-sm font-medium text-stone-700">{member.displayName}</span>
                            <span className="text-[10px] text-stone-400">{member.email}</span>
                        </div>
                        {member.credentials.length === 0 && (
                            <p className="text-xs text-stone-400 pl-8">등록된 계정 없음</p>
                        )}
                        {member.credentials.map((cred) => (
                            <div key={cred.id} className="flex items-center gap-3 pl-8 py-1">
                                <span className="text-xs font-medium text-stone-500 w-24 shrink-0">{cred.label}</span>
                                {cred.loginId && (
                                    <span className="text-xs text-stone-700 font-mono">{cred.loginId}</span>
                                )}
                                {cred.hasPassword && (
                                    <div className="flex items-center gap-1.5">
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
                                {isAdmin && (
                                    <div className="ml-auto flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditId(cred.id);
                                                setEditLabel(cred.label);
                                                setEditLoginId(cred.loginId ?? "");
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
                                    placeholder="예: Windows 계정"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1">로그인 ID</label>
                                <input
                                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
                                    value={addLoginId}
                                    onChange={(e) => setAddLoginId(e.target.value)}
                                    placeholder="예: DOMAIN\username"
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
                                <label className="text-xs font-medium text-stone-500 block mb-1">로그인 ID</label>
                                <input
                                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
                                    value={editLoginId}
                                    onChange={(e) => setEditLoginId(e.target.value)}
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
        </div>
    );
}
