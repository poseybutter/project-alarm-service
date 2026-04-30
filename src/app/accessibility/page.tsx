"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const MEMBERS = ["TEAM_MEMBER_1", "TEAM_MEMBER_2", "TEAM_MEMBER_3", "TEAM_MEMBER_4"];
const INSPECTION_STATUS = ["미신청", "신청완료", "신청불필요"];

type Accessibility = {
    id: number;
    proj: string;
    member: string;
    start_date: string | null;
    end_date: string | null;
    inspection_status: string;
    note: string | null;
};

function getDiff(dateStr: string | null) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const n = new Date();
    d.setHours(0, 0, 0, 0);
    n.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - n.getTime()) / (1000 * 60 * 60 * 24));
}

export default function AccessibilityPage() {
    const [items, setItems] = useState<Accessibility[]>([]);
    const [filter, setFilter] = useState("전체");
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({
        proj: "",
        member: "",
        start_date: "",
        end_date: "",
        inspection_status: "미신청",
        note: "",
    });

    useEffect(() => {
        loadItems();
    }, []);

    async function loadItems() {
        setLoading(true);
        const { data } = await supabase
            .from("accessibility")
            .select("*")
            .order("end_date");
        setItems(data || []);
        setLoading(false);
    }

    async function addItem() {
        if (!form.proj || !form.member)
            return alert("프로젝트명과 담당자는 필수예요");
        await supabase.from("accessibility").insert([
            {
                ...form,
                start_date: form.start_date || null,
                end_date: form.end_date || null,
                note: form.note || null,
            },
        ]);
        setShowModal(false);
        setForm({
            proj: "",
            member: "",
            start_date: "",
            end_date: "",
            inspection_status: "미신청",
            note: "",
        });
        loadItems();
    }

    async function updateInspection(id: number, status: string) {
        await supabase
            .from("accessibility")
            .update({ inspection_status: status })
            .eq("id", id);
        loadItems();
    }

    async function deleteItem(id: number) {
        if (!confirm("삭제할까요?")) return;
        await supabase.from("accessibility").delete().eq("id", id);
        loadItems();
    }

    const filtered =
        filter === "전체" ? items : items.filter((i) => i.member === filter);

    const stats = {
        total: items.length,
        urgent: items.filter((i) => {
            const d = getDiff(i.end_date);
            return d !== null && d <= 45 && i.inspection_status === "미신청";
        }).length,
        done: items.filter((i) => i.inspection_status === "신청완료").length,
    };

    return (
        <div className="min-h-screen bg-stone-50">
            {/* 헤더 */}
            <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                <div className="max-w-2xl mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-base font-bold text-stone-800">
                            접근성 관리
                        </h1>
                        <p className="text-xs text-stone-400 mt-0.5">
                            인증 만료일 관리
                        </p>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-1"
                    >
                        <span className="text-lg leading-none">+</span> 추가
                    </button>
                </div>
            </div>

            <div className="max-w-2xl mx-auto">
                {/* 필터 */}
                <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide bg-white border-b border-stone-200">
                    {["전체", ...MEMBERS].map((m) => (
                        <button
                            key={m}
                            onClick={() => setFilter(m)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all
                ${
                    filter === m
                        ? "bg-amber-600 text-white border-amber-600"
                        : "bg-stone-50 text-stone-500 border-stone-200"
                }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                {/* 통계 */}
                <div className="grid grid-cols-3 gap-2 px-4 py-3">
                    {[
                        { n: stats.total, l: "전체" },
                        { n: stats.urgent, l: "D-45 이내" },
                        { n: stats.done, l: "신청완료" },
                    ].map((s) => (
                        <div
                            key={s.l}
                            className="bg-white rounded-xl border border-stone-200 p-3 text-center"
                        >
                            <div className="text-xl font-bold text-stone-800">
                                {s.n}
                            </div>
                            <div className="text-xs text-stone-400 mt-0.5">
                                {s.l}
                            </div>
                        </div>
                    ))}
                </div>

                {/* 목록 */}
                <div className="px-4 pb-4">
                    {loading ? (
                        <div className="text-center py-16 text-stone-400 text-sm">
                            불러오는 중...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16 text-stone-400 text-sm">
                            항목이 없어요
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                            {filtered.map((item, i) => {
                                const diff = getDiff(item.end_date);
                                const isUrgent =
                                    diff !== null &&
                                    diff <= 45 &&
                                    item.inspection_status === "미신청";
                                return (
                                    <div
                                        key={item.id}
                                        className={`px-4 py-3 ${i < filtered.length - 1 ? "border-b border-stone-100" : ""}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-medium text-stone-800 truncate">
                                                        {item.proj}
                                                    </span>
                                                    {isUrgent && (
                                                        <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full shrink-0">
                                                            D-{diff}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-stone-400">
                                                    <span>{item.member}</span>
                                                    {item.end_date && (
                                                        <span>
                                                            만료:{" "}
                                                            {item.end_date.slice(
                                                                0,
                                                                10,
                                                            )}
                                                        </span>
                                                    )}
                                                    {item.note && (
                                                        <span>{item.note}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                <select
                                                    value={
                                                        item.inspection_status
                                                    }
                                                    onChange={(e) =>
                                                        updateInspection(
                                                            item.id,
                                                            e.target.value,
                                                        )
                                                    }
                                                    className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer
                            ${
                                item.inspection_status === "신청완료"
                                    ? "bg-green-100 text-green-700"
                                    : item.inspection_status === "신청불필요"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-amber-100 text-amber-700"
                            }`}
                                                >
                                                    {INSPECTION_STATUS.map(
                                                        (s) => (
                                                            <option
                                                                key={s}
                                                                value={s}
                                                            >
                                                                {s}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                                <button
                                                    onClick={() =>
                                                        deleteItem(item.id)
                                                    }
                                                    className="text-xs text-stone-300 hover:text-red-400 transition-colors"
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* 추가 모달 */}
            {showModal && (
                <div
                    className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="bg-white rounded-t-2xl p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-base font-bold">접근성 추가</h2>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-2xl text-stone-400 leading-none"
                            >
                                ×
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                    담당자
                                </label>
                                <select
                                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                                    value={form.member}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            member: e.target.value,
                                        })
                                    }
                                >
                                    <option value="">선택</option>
                                    {MEMBERS.map((m) => (
                                        <option key={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                    프로젝트명
                                </label>
                                <input
                                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                    placeholder="예) 한국한의학연구원"
                                    value={form.proj}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            proj: e.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        시작일
                                    </label>
                                    <input
                                        type="date"
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                        value={form.start_date}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                start_date: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        만료일
                                    </label>
                                    <input
                                        type="date"
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                        value={form.end_date}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                end_date: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                    심사신청 상태
                                </label>
                                <select
                                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                                    value={form.inspection_status}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            inspection_status: e.target.value,
                                        })
                                    }
                                >
                                    {INSPECTION_STATUS.map((s) => (
                                        <option key={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                    비고 (선택)
                                </label>
                                <input
                                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                    placeholder="예) 급하지 않음"
                                    value={form.note}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            note: e.target.value,
                                        })
                                    }
                                />
                            </div>
                            <button
                                onClick={addItem}
                                className="w-full bg-amber-600 text-white font-bold py-3.5 rounded-xl text-sm"
                            >
                                추가하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
