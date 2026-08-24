"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Tooltip from "@/components/Tooltip";
import Select from "react-select";
import {
    badgeSelectStyles,
    modalFormSelectStyles,
} from "@/lib/reactSelectStyles";
import { useAuth } from "@/components/AuthProvider";
import type { Project } from "@/lib/types";
import { findProjectId, findTeamMemberId, normalizeProject } from "@/lib/utils";

const INSPECTION_STATUS = ["갱신완료", "신청완료", "신청불필요"];
const INSPECTION_OPTIONS = INSPECTION_STATUS.map((s) => ({
    value: s,
    label: s,
}));

function accStatusStyle(status: string) {
    if (status === "신청완료") return "bg-green-100 text-green-700";
    if (status === "신청불필요") return "bg-stone-100 text-stone-500";
    return "bg-amber-100 text-amber-700";
}

function InspectionBadgeSelect({
    status,
    onChange,
}: {
    status: string;
    onChange: (next: string) => void;
}) {
    return (
        <div
            className={`rounded-full ${accStatusStyle(status)}`}
        >
            <Select
                options={INSPECTION_OPTIONS}
                value={{ value: status, label: status }}
                onChange={(opt) => {
                    if (!opt) return;
                    onChange(opt.value);
                }}
                isSearchable={false}
                isClearable={false}
                styles={badgeSelectStyles}
                menuPortalTarget={
                    typeof document !== "undefined" ? document.body : null
                }
                menuPlacement="auto"
            />
        </div>
    );
}

type Accessibility = {
    id: number;
    player_id?: number | null;
    project_id?: number | null;
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
    const { members, memberOptions, teamId } = useAuth();
    const [items, setItems] = useState<Accessibility[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [filter, setFilter] = useState("전체");
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({
        proj: "",
        member: "",
        start_date: "",
        end_date: "",
        inspection_status: "갱신완료",
        note: "",
    });

    useEffect(() => {
        if (!teamId) return;
        let cancelled = false;
        void loadItems(teamId, () => cancelled);
        return () => {
            cancelled = true;
        };
    }, [teamId]);

    async function loadItems(requestedTeamId = teamId, isCancelled = () => false) {
        if (!requestedTeamId) return;
        setLoading(true);
        const [{ data }, { data: projectRows }] = await Promise.all([
            supabase
                .from("accessibility")
                .select("*")
                .eq("team_id", requestedTeamId)
                .order("end_date"),
            supabase
                .from("projects")
                .select("*")
                .eq("team_id", requestedTeamId)
                .order("name"),
        ]);
        if (isCancelled()) return;
        setItems(
            (data || []).map((row) => ({
                ...row,
                inspection_status:
                    row.inspection_status === "미신청"
                        ? "갱신완료"
                        : row.inspection_status,
            })),
        );
        setProjects(
            (projectRows || [])
                .map((row) => normalizeProject(row as Record<string, unknown>))
                .filter((project) => !project.is_archived),
        );
        setLoading(false);
    }

    async function addItem() {
        if (!teamId) return;
        if (!form.proj || !form.member)
            return alert("프로젝트명과 담당자는 필수예요");
        const selectedPlayerId = findTeamMemberId(memberOptions, form.member);
        const selectedProjectId = findProjectId(projects, form.proj);
        if (selectedPlayerId === null || selectedProjectId === null) {
            alert("현재 팀의 담당자와 프로젝트를 다시 선택해주세요");
            return;
        }
        const { error } = await supabase.from("accessibility").insert([
            {
                ...form,
                player_id: selectedPlayerId,
                project_id: selectedProjectId,
                start_date: form.start_date || null,
                end_date: form.end_date || null,
                note: form.note || null,
                team_id: teamId,
            },
        ]);
        if (error) {
            alert("접근성 항목 등록에 실패했어요");
            return;
        }
        setShowModal(false);
        setForm({
            proj: "",
            member: "",
            start_date: "",
            end_date: "",
            inspection_status: "갱신완료",
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
            return d !== null && d <= 45 && i.inspection_status === "갱신완료";
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
                    {["전체", ...members].map((m) => (
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
                <div className="px-4 pb-24">
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
                                    item.inspection_status === "갱신완료";
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
                                                <InspectionBadgeSelect
                                                    status={
                                                        item.inspection_status
                                                    }
                                                    onChange={(next) =>
                                                        updateInspection(
                                                            item.id,
                                                            next,
                                                        )
                                                    }
                                                />
                                                <Tooltip label="삭제">
                                                    <button
                                                        onClick={() =>
                                                            deleteItem(item.id)
                                                        }
                                                        aria-label="삭제"
                                                        className="text-base text-stone-300 hover:text-red-400 transition-colors"
                                                    >
                                                        <i
                                                            className="ri-delete-bin-line"
                                                            aria-hidden
                                                        />
                                                    </button>
                                                </Tooltip>
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
                        className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
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
                                <Select
                                    options={members.map((m) => ({
                                        value: m,
                                        label: m,
                                    }))}
                                    value={
                                        form.member
                                            ? {
                                                  value: form.member,
                                                  label: form.member,
                                              }
                                            : null
                                    }
                                    onChange={(opt) =>
                                        setForm({
                                            ...form,
                                            member: opt?.value ?? "",
                                        })
                                    }
                                    placeholder="선택"
                                    isSearchable={false}
                                    isClearable={false}
                                    styles={modalFormSelectStyles}
                                    menuPortalTarget={
                                        typeof document !== "undefined"
                                            ? document.body
                                            : null
                                    }
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                    프로젝트명
                                </label>
                                <Select
                                    options={projects.map((project) => ({
                                        value: project.name,
                                        label: project.name,
                                    }))}
                                    value={
                                        form.proj
                                            ? {
                                                  value: form.proj,
                                                  label: form.proj,
                                              }
                                            : null
                                    }
                                    onChange={(opt) =>
                                        setForm({
                                            ...form,
                                            proj: opt?.value ?? "",
                                        })
                                    }
                                    placeholder="프로젝트 검색"
                                    isSearchable
                                    isClearable={false}
                                    styles={modalFormSelectStyles}
                                    menuPortalTarget={
                                        typeof document !== "undefined"
                                            ? document.body
                                            : null
                                    }
                                    noOptionsMessage={() =>
                                        "검색 결과가 없어요"
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
                                <Select
                                    options={INSPECTION_OPTIONS}
                                    value={{
                                        value: form.inspection_status,
                                        label: form.inspection_status,
                                    }}
                                    onChange={(opt) => {
                                        if (!opt) return;
                                        setForm({
                                            ...form,
                                            inspection_status: opt.value,
                                        });
                                    }}
                                    isSearchable={false}
                                    isClearable={false}
                                    styles={modalFormSelectStyles}
                                    menuPortalTarget={
                                        typeof document !== "undefined"
                                            ? document.body
                                            : null
                                    }
                                />
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
