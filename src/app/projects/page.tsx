"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/lib/types";
import { normalizeProject, getProjectMembers } from "@/lib/utils";
import { MEMBERS } from "@/lib/constants";

const MEMBER_COLORS: Record<string, string> = {
    조현석: "bg-purple-100 text-purple-700",
    조정연: "bg-green-100 text-green-700",
    이헌희: "bg-amber-100 text-amber-700",
    이지은: "bg-orange-100 text-orange-700",
};

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [filter, setFilter] = useState("전체");
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ name: "", member: "", client: "" });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProjects();
    }, []);

    async function loadProjects() {
        setLoading(true);
        const { data } = await supabase
            .from("projects")
            .select("*")
            .order("name");
        setProjects(
            (data || []).map((row) =>
                normalizeProject(row as Record<string, unknown>),
            ),
        );
        setLoading(false);
    }

    async function addProject() {
        if (!form.name || !form.member)
            return alert("프로젝트명과 담당자는 필수예요");
        await supabase.from("projects").insert([
            {
                name: form.name,
                member: form.member,
                members: [form.member],
                client: form.client || null,
            },
        ]);
        setShowModal(false);
        setForm({ name: "", member: "", client: "" });
        loadProjects();
    }

    async function deleteProject(id: number) {
        if (!confirm("삭제할까요?")) return;
        await supabase.from("projects").delete().eq("id", id);
        loadProjects();
    }

    const filtered =
        filter === "전체"
            ? projects
            : projects.filter((p) => getProjectMembers(p).includes(filter));

    const grouped = MEMBERS.reduce(
        (acc, m) => {
            const mp = filtered.filter((p) => getProjectMembers(p).includes(m));
            if (mp.length > 0) acc[m] = mp;
            return acc;
        },
        {} as Record<string, Project[]>,
    );

    return (
        <div className="min-h-screen bg-stone-50">
            {/* 헤더 */}
            <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                <div className="max-w-2xl mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-base font-bold text-stone-800">
                            프로젝트 관리
                        </h1>
                        <p className="text-xs text-stone-400 mt-0.5">
                            총 {projects.length}개
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
                {/* 필터 탭 */}
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

                {/* 프로젝트 목록 */}
                <div className="px-4 pt-3">
                    {loading ? (
                        <div className="text-center py-16 text-stone-400 text-sm">
                            불러오는 중...
                        </div>
                    ) : Object.keys(grouped).length === 0 ? (
                        <div className="text-center py-16 text-stone-400 text-sm">
                            프로젝트가 없어요
                        </div>
                    ) : (
                        Object.entries(grouped).map(
                            ([member, memberProjects]) => (
                                <div key={member} className="mb-4">
                                    <div className="flex items-center gap-2 py-2">
                                        <div
                                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${MEMBER_COLORS[member]}`}
                                        >
                                            {member.slice(1)}
                                        </div>
                                        <span className="text-sm font-bold text-stone-800">
                                            {member}
                                        </span>
                                        <span className="text-xs text-stone-400">
                                            {memberProjects.length}개
                                        </span>
                                    </div>
                                    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                        {memberProjects.map((p, i) => (
                                            <div
                                                key={p.id}
                                                className={`flex items-center justify-between px-4 py-3
                        ${i < memberProjects.length - 1 ? "border-b border-stone-100" : ""}`}
                                            >
                                                <div>
                                                    <p className="text-sm font-medium text-stone-800">
                                                        {p.name}
                                                    </p>
                                                    {p.client && (
                                                        <p className="text-xs text-stone-400 mt-0.5">
                                                            {p.client}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() =>
                                                        deleteProject(p.id)
                                                    }
                                                    className="text-xs text-stone-300 hover:text-red-400 transition-colors px-2 py-1"
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ),
                        )
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
                        className="bg-white rounded-t-2xl p-5 w-full max-w-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-base font-bold">
                                프로젝트 추가
                            </h2>
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
                                    placeholder="예) 사이버견본주택"
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            name: e.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                    고객사 (선택)
                                </label>
                                <input
                                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                    placeholder="예) LH한국토지주택공사"
                                    value={form.client}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            client: e.target.value,
                                        })
                                    }
                                />
                            </div>
                            <button
                                onClick={addProject}
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
