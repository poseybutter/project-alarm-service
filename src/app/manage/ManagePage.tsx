"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import AuthGuard from "@/components/AuthGuard";
import UserMenu from "@/components/UserMenu";
import NotificationButton from "@/components/NotificationButton";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import Avatar from "@/components/Avatar";
import { PageSpinner } from "@/components/Spinner";
import type { Accessibility, Project } from "@/lib/types";
import { getDiff, normalizeProject, getProjectMembers } from "@/lib/utils";
import { MEMBERS } from "@/lib/constants";
import Select from "react-select";
import { selectStyles } from "@/lib/reactSelectStyles";

const EMPTY_PROJ_FORM = {
    name: "",
    client: "",
    members: [] as string[],
    languages: [] as string[],
    pm: "",
    developer: "",
    designer: "",
    prev_member: "",
    frequency: "",
    note: "",
};

const PROJ_LANG_OPTIONS = ["PHP", "JSP", "기타"] as const;

const toYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const ACC_INSPECTION_OPTIONS = [
    "신청필요",
    "신청완료",
    "취득·갱신완료",
    "신청불필요",
] as const;

/** 접근성 점검 상태별 배지 스타일 */
function accStatusStyle(status: string) {
    if (status === "취득·갱신완료") return "bg-green-100 text-green-700";
    if (status === "신청완료") return "bg-blue-100 text-blue-700";
    if (status === "신청불필요") return "bg-stone-100 text-stone-500";
    return "bg-amber-100 text-amber-700"; // 신청필요
}

export default function ManagePage() {
    const { member, role } = useAuth();
    const isGuest = member === "GUEST" || role === "guest";
    const isAdmin = role === "admin";

    const [manageTab, setManageTab] = useState<"project" | "accessibility">(
        "project",
    );
    const [projects, setProjects] = useState<Project[]>([]);
    const [accessibility, setAccessibility] = useState<Accessibility[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState("");

    const [showProjModal, setShowProjModal] = useState(false);
    const [showAccModal, setShowAccModal] = useState(false);
    const [editProj, setEditProj] = useState<Project | null>(null);
    const [editAcc, setEditAcc] = useState<Accessibility | null>(null);
    const [expandedProj, setExpandedProj] = useState<Record<number, boolean>>(
        {},
    );
    const [searchProj, setSearchProj] = useState("");
    const [filterProjMember, setFilterProjMember] = useState("");
    const [filterProjLang, setFilterProjLang] = useState("");
    const [sortProj, setSortProj] = useState<"가나다" | "담당자">("가나다");
    const [searchAcc, setSearchAcc] = useState("");
    const [filterAccMember, setFilterAccMember] = useState("");
    const [filterAccStatus, setFilterAccStatus] = useState("");
    const [sortAcc, setSortAcc] = useState<
        "날짜순" | "가나다순" | "담당자순"
    >("날짜순");
    const [showAccStartPicker, setShowAccStartPicker] = useState(false);
    const [showAccEndPicker, setShowAccEndPicker] = useState(false);
    const [accProjMode, setAccProjMode] = useState<"select" | "direct">(
        "select",
    );
    const [projForm, setProjForm] = useState({ ...EMPTY_PROJ_FORM });
    const [accForm, setAccForm] = useState({
        proj: "",
        start_date: "",
        end_date: "",
        inspection_status: "신청필요",
        note: "",
        accMember: "",
        is_new: false,
    });

    const emptyAccForm = {
        proj: "",
        start_date: "",
        end_date: "",
        inspection_status: "신청필요",
        note: "",
        accMember: "",
        is_new: false,
    } as const;

    useEffect(() => {
        if (member) void loadData();
    }, [member]);

    const projNameOptions = useMemo(
        () =>
            projects
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((p) => ({ value: p.name, label: p.name })),
        [projects],
    );

    const accTabProjFilterOptions = useMemo(
        () =>
            [...new Set(accessibility.map((a) => a.proj).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, "ko"))
                .map((p) => ({ value: p, label: p })),
        [accessibility],
    );

    const accModalProjOptions = useMemo(
        () =>
            projects
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((p) => ({ value: p.name, label: p.name })),
        [projects],
    );

    const accModalSelectStyles = useMemo(
        () => ({
            ...selectStyles,
            control: (
                base: Record<string, unknown>,
                state: { isFocused: boolean },
            ) => ({
                ...base,
                fontSize: "14px",
                borderColor: state.isFocused ? "#f59e0b" : "#e7e5e4",
                borderRadius: "8px",
                boxShadow: state.isFocused ? "0 0 0 2px #fde68a" : "none",
                "&:hover": { borderColor: "#d6d3d1" },
                minHeight: "42px",
                height: "42px",
            }),
            valueContainer: (base: Record<string, unknown>) => ({
                ...base,
                height: "42px",
                padding: "0 12px",
            }),
            indicatorsContainer: (base: Record<string, unknown>) => ({
                ...base,
                height: "42px",
            }),
            placeholder: (base: Record<string, unknown>) => ({
                ...base,
                fontSize: "14px",
            }),
        }),
        [],
    );

    if (!member) return null;

    async function loadData() {
        setLoading(true);
        const [{ data: projData }, { data: accData }] = await Promise.all([
            supabase
                .from("projects")
                .select("*")
                .order("name", { ascending: true }),
            supabase
                .from("accessibility")
                .select("*")
                .order("end_date", { ascending: true }),
        ]);
        setProjects(
            (projData || []).map((row) =>
                normalizeProject(row as Record<string, unknown>),
            ),
        );
        setAccessibility(
            (accData || []).map((row) => ({
                ...row,
                inspection_status:
                    row.inspection_status === "미신청"
                        ? "신청필요"
                        : row.inspection_status === "갱신완료"
                          ? "취득·갱신완료"
                          : row.inspection_status,
                is_new: row.is_new ?? false,
            })),
        );
        setLoading(false);
    }

    function showToastMsg(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    }

    function closeProjModal() {
        setShowProjModal(false);
        setEditProj(null);
        setProjForm({ ...EMPTY_PROJ_FORM });
    }

    function openProjModalForAdd() {
        setEditProj(null);
        setProjForm({ ...EMPTY_PROJ_FORM });
        setShowProjModal(true);
    }

    function openProjModalForEdit(p: Project) {
        setEditProj(p);
        setProjForm({
            name: p.name,
            client: p.client ?? "",
            members: [...getProjectMembers(p)],
            languages: p.language
                ? p.language
                      .split(",")
                      .map((s: string) => s.trim())
                      .filter(Boolean)
                : [],
            pm: p.pm ?? "",
            developer: p.developer ?? "",
            designer: p.designer ?? "",
            prev_member: p.prev_member ?? "",
            frequency: p.frequency ?? "",
            note: p.note ?? "",
        });
        setShowProjModal(true);
    }

    function toggleProjMember(name: string) {
        setProjForm((prev) => ({
            ...prev,
            members: prev.members.includes(name)
                ? prev.members.filter((m) => m !== name)
                : [...prev.members, name],
        }));
    }

    function toggleProjLang(lang: string) {
        setProjForm((f) => ({
            ...f,
            languages: f.languages.includes(lang)
                ? f.languages.filter((l) => l !== lang)
                : [...f.languages, lang],
        }));
    }

    async function saveProject() {
        if (isGuest) return;
        if (!projForm.name.trim()) return alert("프로젝트명은 필수예요");
        if (!projForm.members.length)
            return alert("담당자를 1명 이상 선택해 주세요");

        const langStr =
            ["PHP", "JSP", "기타"]
                .filter((l) => projForm.languages.includes(l))
                .join(", ") || null;

        const payload = {
            name: projForm.name.trim(),
            client: projForm.client || null,
            members: projForm.members,
            member: projForm.members[0] || null,
            language: langStr,
            pm: projForm.pm || null,
            developer: projForm.developer || null,
            designer: projForm.designer || null,
            frequency: projForm.frequency || null,
            prev_member: projForm.prev_member || null,
            note: projForm.note || null,
        };

        if (editProj) {
            const { error } = await supabase
                .from("projects")
                .update(payload)
                .eq("id", editProj.id);
            if (error) {
                alert("저장 실패: " + error.message);
                return;
            }
        } else {
            const { error } = await supabase.from("projects").insert([payload]);
            if (error) {
                alert("추가 실패: " + error.message);
                return;
            }
        }
        closeProjModal();
        await loadData();
    }

    async function deleteProject(id: number) {
        if (isGuest) return;
        if (!confirm("삭제할까요?")) return;
        await supabase.from("projects").delete().eq("id", id);
        await loadData();
    }

    function openAccModalForAdd() {
        setEditAcc(null);
        setShowAccStartPicker(false);
        setShowAccEndPicker(false);
        setAccProjMode("select");
        setAccForm({
            ...emptyAccForm,
            accMember: member || "",
        });
        setShowAccModal(true);
    }

    function openAccModalForEdit(a: Accessibility) {
        setEditAcc(a);
        setShowAccStartPicker(false);
        setShowAccEndPicker(false);
        const normalizedStatus =
            a.inspection_status === "미신청"
                ? "신청필요"
                : a.inspection_status === "갱신완료"
                  ? "취득·갱신완료"
                  : a.inspection_status;
        const inProjectList = projects.some((p) => p.name === a.proj);
        setAccProjMode(inProjectList ? "select" : "direct");
        setAccForm({
            proj: a.proj,
            start_date: a.start_date ? a.start_date.slice(0, 10) : "",
            end_date: a.end_date ? a.end_date.slice(0, 10) : "",
            inspection_status: normalizedStatus,
            note: a.note ?? "",
            accMember: a.member,
            is_new: a.is_new ?? false,
        });
        setShowAccModal(true);
    }

    function closeAccModal() {
        setShowAccModal(false);
        setEditAcc(null);
        setShowAccStartPicker(false);
        setShowAccEndPicker(false);
        setAccProjMode("select");
        setAccForm({ ...emptyAccForm });
    }

    async function saveAccessibility() {
        if (!accForm.proj) return alert("프로젝트명은 필수예요");
        if (isGuest) return;

        if (editAcc) {
            const { error } = await supabase
                .from("accessibility")
                .update({
                    proj: accForm.proj,
                    start_date: accForm.start_date || null,
                    end_date: accForm.end_date || null,
                    inspection_status: accForm.inspection_status,
                    note: accForm.note || null,
                    is_new: accForm.is_new,
                })
                .eq("id", editAcc.id);
            if (error) {
                showToastMsg("저장 실패: " + error.message);
                return;
            }
        } else {
            const assignee =
                role === "admin" ? accForm.accMember : member ?? "";
            const { error } = await supabase.from("accessibility").insert([
                {
                    proj: accForm.proj,
                    member: assignee,
                    start_date: accForm.start_date || null,
                    end_date: accForm.end_date || null,
                    note: accForm.note || null,
                    inspection_status: accForm.inspection_status || "신청필요",
                    is_new: accForm.is_new,
                },
            ]);
            if (error) {
                showToastMsg("등록 실패: " + error.message);
                return;
            }
        }
        closeAccModal();
        await loadData();
    }

    async function updateAccStatus(id: number, status: string) {
        const row = accessibility.find((a) => a.id === id);
        if (!row) return;
        const can = !isGuest && (role === "admin" || row.member === member);
        if (!can) return;
        await supabase
            .from("accessibility")
            .update({ inspection_status: status })
            .eq("id", id);
        await loadData();
    }

    async function deleteAcc(id: number) {
        const row = accessibility.find((a) => a.id === id);
        if (!row) return;
        const can = !isGuest && (role === "admin" || row.member === member);
        if (!can) return;
        if (!confirm("삭제할까요?")) return;
        await supabase.from("accessibility").delete().eq("id", id);
        await loadData();
    }

    const filteredProjects = projects
        .filter((p) => {
            const q = searchProj.trim();
            const matchSearch =
                !q || p.name.toLowerCase().includes(q.toLowerCase());
            const matchMember =
                !filterProjMember ||
                p.member === filterProjMember ||
                (p.members || []).includes(filterProjMember);
            const langUpper = (p.language || "").toUpperCase();
            const matchLang = !filterProjLang
                ? true
                : filterProjLang === "기타"
                  ? !["PHP", "JSP"].some((l) => langUpper.includes(l))
                  : langUpper.includes(filterProjLang.toUpperCase());
            return matchSearch && matchMember && matchLang;
        })
        .sort((a, b) => {
            if (sortProj === "담당자") {
                const ma = a.member || "";
                const mb = b.member || "";
                return (
                    ma.localeCompare(mb, "ko") ||
                    a.name.localeCompare(b.name, "ko")
                );
            }
            return a.name.localeCompare(b.name, "ko");
        });

    const filteredAcc = accessibility
        .filter((a) => {
            const q = searchAcc.trim();
            const matchSearch =
                !q || a.proj.toLowerCase().includes(q.toLowerCase());
            const matchMember =
                !filterAccMember || a.member === filterAccMember;
            const matchStatus =
                !filterAccStatus || a.inspection_status === filterAccStatus;
            return matchSearch && matchMember && matchStatus;
        })
        .sort((a, b) => {
            if (sortAcc === "날짜순") {
                if (!a.end_date) return 1;
                if (!b.end_date) return -1;
                return a.end_date.localeCompare(b.end_date);
            }
            if (sortAcc === "담당자순") {
                return (a.member || "").localeCompare(b.member || "", "ko");
            }
            return (a.proj || "").localeCompare(b.proj || "", "ko");
        });

    const canEditRowAcc = (a: Accessibility) =>
        !isGuest && (role === "admin" || a.member === member);

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f7f6f3] pb-24">
                <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                    <div className="max-w-2xl mx-auto flex justify-between items-center gap-2">
                        <h1 className="text-base font-bold text-stone-900 shrink-0">
                            관리
                        </h1>
                        <div className="flex items-center gap-2 shrink-0">
                            {manageTab === "project" && !isGuest && (
                                <button
                                    type="button"
                                    onClick={openProjModalForAdd}
                                    className="bg-amber-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                                >
                                    + 프로젝트 추가
                                </button>
                            )}
                            {manageTab === "accessibility" && !isGuest && (
                                <button
                                    type="button"
                                    onClick={openAccModalForAdd}
                                    className="bg-amber-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                                >
                                    + 접근성 추가
                                </button>
                            )}
                            <NotificationButton />
                            <UserMenu />
                        </div>
                    </div>
                </div>

                <div className="max-w-2xl mx-auto px-4 pt-4">
                    <div className="flex bg-white rounded-lg p-0.5 mb-4">
                        <button
                            type="button"
                            onClick={() => setManageTab("project")}
                            className={`flex-1 py-2 text-xs font-medium rounded-md transition-all
                ${manageTab === "project" ? "bg-amber-500 text-white shadow-sm" : "text-stone-400 hover:text-stone-600"}`}
                        >
                            프로젝트
                        </button>
                        <button
                            type="button"
                            onClick={() => setManageTab("accessibility")}
                            className={`flex-1 py-2 text-xs font-medium rounded-md transition-all
                ${manageTab === "accessibility" ? "bg-amber-500 text-white shadow-sm" : "text-stone-400 hover:text-stone-600"}`}
                        >
                            접근성
                        </button>
                    </div>

                    {loading ? (
                        <PageSpinner />
                    ) : manageTab === "project" ? (
                        <div>
                            <div className="flex flex-wrap gap-2 mb-2">
                                <div className="relative min-w-0 flex-1 text-xs">
                                    <Select
                                        aria-label="프로젝트명 검색"
                                        options={projNameOptions}
                                        value={
                                            searchProj
                                                ? {
                                                      value: searchProj,
                                                      label: searchProj,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setSearchProj(opt?.value ?? "")
                                        }
                                        placeholder="프로젝트 선택"
                                        isClearable
                                        isSearchable
                                        styles={selectStyles}
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
                                <div className="relative min-w-0 shrink max-w-[38%] sm:max-w-none">
                                    <select
                                        className="min-w-0 w-full border border-stone-200 rounded-lg px-2 py-2 text-xs bg-white appearance-none pr-8"
                                        value={filterProjMember}
                                        onChange={(e) =>
                                            setFilterProjMember(e.target.value)
                                        }
                                        aria-label="담당자 필터"
                                    >
                                        <option value="">전체 담당자</option>
                                        {MEMBERS.map((m) => (
                                            <option key={m} value={m}>
                                                {m}
                                            </option>
                                        ))}
                                    </select>
                                    <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                </div>
                                <div className="relative min-w-0 shrink max-w-[38%] sm:max-w-none">
                                    <select
                                        className="min-w-0 w-full border border-stone-200 rounded-lg px-2 py-2 text-xs bg-white appearance-none pr-8"
                                        value={filterProjLang}
                                        onChange={(e) =>
                                            setFilterProjLang(e.target.value)
                                        }
                                        aria-label="언어 필터"
                                    >
                                        <option value="">전체 언어</option>
                                        <option value="JSP">JSP</option>
                                        <option value="PHP">PHP</option>
                                        <option value="기타">기타</option>
                                    </select>
                                    <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs text-stone-400">
                                    총 {filteredProjects.length}개
                                </span>
                                <div className="relative">
                                    <select
                                        className="border border-stone-200 rounded-lg px-2 py-1.5 text-xs bg-white appearance-none pr-8"
                                        value={sortProj}
                                        onChange={(e) =>
                                            setSortProj(
                                                e.target.value as
                                                    | "가나다"
                                                    | "담당자",
                                            )
                                        }
                                        aria-label="정렬"
                                    >
                                        <option value="가나다">가나다순</option>
                                        <option value="담당자">담당자순</option>
                                    </select>
                                    <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                </div>
                            </div>
                            {projects.length === 0 ? (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                    <p className="text-xs text-stone-400 text-center py-6">
                                        프로젝트가 없어요
                                    </p>
                                </div>
                            ) : filteredProjects.length === 0 ? (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                    <p className="text-xs text-stone-400 text-center py-6">
                                        조건에 맞는 프로젝트가 없어요
                                    </p>
                                </div>
                            ) : (
                                filteredProjects.map((p) => {
                                    const isOpen = !!expandedProj[p.id];
                                    const projMembers =
                                        p.members?.length > 0
                                            ? p.members
                                            : p.member
                                              ? [p.member]
                                              : [];
                                    return (
                                        <div
                                            key={p.id}
                                            className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-2"
                                        >
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                aria-expanded={isOpen}
                                                onClick={() =>
                                                    setExpandedProj((e) => ({
                                                        ...e,
                                                        [p.id]: !e[p.id],
                                                    }))
                                                }
                                                onKeyDown={(e) => {
                                                    if (
                                                        e.key === "Enter" ||
                                                        e.key === " "
                                                    ) {
                                                        e.preventDefault();
                                                        setExpandedProj(
                                                            (prev) => ({
                                                                ...prev,
                                                                [p.id]: !prev[
                                                                    p.id
                                                                ],
                                                            }),
                                                        );
                                                    }
                                                }}
                                                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50/80"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {p.language && (
                                                            <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-500">
                                                                {p.language}
                                                            </span>
                                                        )}
                                                        <span className="truncate text-sm font-medium text-stone-800">
                                                            {p.name}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    {projMembers
                                                        .slice(0, 3)
                                                        .map((m) => (
                                                            <Avatar
                                                                key={m}
                                                                name={m}
                                                                size={20}
                                                            />
                                                        ))}
                                                    {!isGuest && (
                                                        <div
                                                            className="flex gap-1.5"
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    openProjModalForEdit(
                                                                        p,
                                                                    )
                                                                }
                                                                className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                                                            >
                                                                수정
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    void deleteProject(
                                                                        p.id,
                                                                    )
                                                                }
                                                                className="text-xs text-stone-400 hover:text-red-500"
                                                            >
                                                                삭제
                                                            </button>
                                                        </div>
                                                    )}
                                                    {isOpen ? (
                                                        <i
                                                            className="ri-arrow-up-s-line text-stone-400"
                                                            aria-hidden
                                                        />
                                                    ) : (
                                                        <i
                                                            className="ri-arrow-down-s-line text-stone-400"
                                                            aria-hidden
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                            {isOpen && (
                                                <div className="space-y-1.5 px-4 pb-4 pt-1">
                                                    {projMembers.length > 0 && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-stone-400 w-16 shrink-0">
                                                                담당자
                                                            </span>
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                {projMembers.map(
                                                                    (m) => (
                                                                        <div
                                                                            key={
                                                                                m
                                                                            }
                                                                            className="flex items-center gap-1"
                                                                        >
                                                                            <Avatar
                                                                                name={
                                                                                    m
                                                                                }
                                                                                size={
                                                                                    16
                                                                                }
                                                                            />
                                                                            <span className="text-xs text-stone-600">
                                                                                {
                                                                                    m
                                                                                }
                                                                            </span>
                                                                        </div>
                                                                    ),
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {p.pm && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-stone-400 w-16 shrink-0">
                                                                PM
                                                            </span>
                                                            <span className="text-xs text-stone-600">
                                                                {p.pm}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {p.developer && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-stone-400 w-16 shrink-0">
                                                                개발자
                                                            </span>
                                                            <span className="text-xs text-stone-600">
                                                                {p.developer}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {p.designer && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-stone-400 w-16 shrink-0">
                                                                디자이너
                                                            </span>
                                                            <span className="text-xs text-stone-600">
                                                                {p.designer}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {p.frequency && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-stone-400 w-16 shrink-0">
                                                                빈도
                                                            </span>
                                                            <span className="text-xs text-stone-600">
                                                                {p.frequency}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {p.prev_member && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-stone-400 w-16 shrink-0">
                                                                이전담당
                                                            </span>
                                                            <span className="text-xs text-stone-600">
                                                                {p.prev_member}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {p.note && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-xs text-stone-400 w-16 shrink-0">
                                                                비고
                                                            </span>
                                                            <span className="text-xs text-stone-600 leading-relaxed">
                                                                {p.note}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        <div>
                            <div className="flex flex-wrap gap-2 mb-2">
                                <div className="relative min-w-0 flex-1 text-xs">
                                    <Select
                                        aria-label="프로젝트명 검색"
                                        options={accTabProjFilterOptions}
                                        value={
                                            searchAcc
                                                ? {
                                                      value: searchAcc,
                                                      label: searchAcc,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setSearchAcc(opt?.value ?? "")
                                        }
                                        placeholder="프로젝트 선택"
                                        isClearable
                                        isSearchable
                                        styles={selectStyles}
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
                                <div className="relative min-w-0 shrink">
                                    <select
                                        className="min-w-0 w-full border border-stone-200 rounded-lg px-2 py-2 text-xs bg-white appearance-none pr-8"
                                        value={filterAccMember}
                                        onChange={(e) =>
                                            setFilterAccMember(e.target.value)
                                        }
                                        aria-label="담당자 필터"
                                    >
                                        <option value="">전체 담당자</option>
                                        {MEMBERS.map((m) => (
                                            <option key={m} value={m}>
                                                {m}
                                            </option>
                                        ))}
                                    </select>
                                    <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                </div>
                                <div className="relative min-w-0 shrink">
                                    <select
                                        className="min-w-0 w-full border border-stone-200 rounded-lg px-2 py-2 text-xs bg-white appearance-none pr-8"
                                        value={filterAccStatus}
                                        onChange={(e) =>
                                            setFilterAccStatus(e.target.value)
                                        }
                                        aria-label="점검 상태 필터"
                                    >
                                        <option value="">전체 상태</option>
                                        <option value="신청필요">
                                            신청필요
                                        </option>
                                        <option value="신청완료">
                                            신청완료
                                        </option>
                                        <option value="취득·갱신완료">
                                            취득·갱신완료
                                        </option>
                                        <option value="신청불필요">
                                            신청불필요
                                        </option>
                                    </select>
                                    <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                </div>
                            </div>
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-xs text-stone-400">
                                    총 {filteredAcc.length}개
                                </span>
                                <div className="relative">
                                    <select
                                        className="border border-stone-200 rounded-lg px-2 py-1.5 text-xs bg-white appearance-none pr-8"
                                        value={sortAcc}
                                        onChange={(e) =>
                                            setSortAcc(
                                                e.target.value as
                                                    | "날짜순"
                                                    | "가나다순"
                                                    | "담당자순",
                                            )
                                        }
                                        aria-label="접근성 정렬"
                                    >
                                        <option value="날짜순">날짜순</option>
                                        <option value="가나다순">가나다순</option>
                                        <option value="담당자순">
                                            담당자순
                                        </option>
                                    </select>
                                    <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                {accessibility.length === 0 ? (
                                    <p className="text-xs text-stone-400 text-center py-6">
                                        등록된 항목이 없어요
                                    </p>
                                ) : filteredAcc.length === 0 ? (
                                    <p className="text-xs text-stone-400 text-center py-6">
                                        조건에 맞는 항목이 없어요
                                    </p>
                                ) : (
                                    filteredAcc.map((a, i) => {
                                        const diff = getDiff(a.end_date);
                                        const isUrgent =
                                            diff !== null &&
                                            diff <= 14 &&
                                            a.inspection_status === "신청필요";
                                        const isWarning =
                                            diff !== null &&
                                            diff > 14 &&
                                            diff <= 45 &&
                                            a.inspection_status === "신청필요";
                                        const canRow = canEditRowAcc(a);
                                        return (
                                            <div
                                                key={a.id}
                                                className={`flex items-center justify-between px-4 py-3
                      ${isUrgent ? "bg-red-50" : isWarning ? "bg-amber-50" : ""}
                      ${i < filteredAcc.length - 1 ? "border-b border-stone-100" : ""}`}
                                            >
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <Avatar
                                                        name={a.member}
                                                        size={24}
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {a.is_new && (
                                                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-bold shrink-0">
                                                                    NEW
                                                                </span>
                                                            )}
                                                            <p className="text-sm font-medium text-stone-800 truncate">
                                                                {a.proj}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs mt-0.5 flex-wrap">
                                                            {a.end_date && (
                                                                <span
                                                                    className={
                                                                        isUrgent
                                                                            ? "text-red-500 font-medium"
                                                                            : isWarning
                                                                              ? "text-amber-600 font-medium"
                                                                              : "text-stone-400"
                                                                    }
                                                                >
                                                                    만료:{" "}
                                                                    {a.end_date.slice(
                                                                        0,
                                                                        10,
                                                                    )}
                                                                    {diff !==
                                                                        null &&
                                                                        ` (${diff < 0 ? "기한초과 " + Math.abs(diff) + "일" : "D-" + diff})`}
                                                                </span>
                                                            )}
                                                            {a.note && (
                                                                <span className="text-stone-400 truncate">
                                                                    · {a.note}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <div className="relative">
                                                        <select
                                                            value={
                                                                a.inspection_status
                                                            }
                                                            disabled={!canRow}
                                                            onChange={(e) => {
                                                                if (canRow)
                                                                    void updateAccStatus(
                                                                        a.id,
                                                                        e.target
                                                                            .value,
                                                                    );
                                                            }}
                                                            title="점검 상태"
                                                            className={`text-xs px-2 py-1 pr-7 rounded-lg font-medium border-0 max-w-[5.5rem] sm:max-w-none appearance-none
                              ${!canRow ? "cursor-not-allowed opacity-70" : "cursor-pointer"}
                              ${accStatusStyle(a.inspection_status)}`}
                                                        >
                                                            {ACC_INSPECTION_OPTIONS.map(
                                                                (s) => (
                                                                    <option
                                                                        key={s}
                                                                        value={
                                                                            s
                                                                        }
                                                                    >
                                                                        {s}
                                                                    </option>
                                                                ),
                                                            )}
                                                        </select>
                                                        <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                                    </div>
                                                    {canRow && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    openAccModalForEdit(
                                                                        a,
                                                                    )
                                                                }
                                                                className="text-xs text-amber-600 hover:text-amber-700 font-medium whitespace-nowrap"
                                                            >
                                                                수정
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    void deleteAcc(
                                                                        a.id,
                                                                    )
                                                                }
                                                                className="text-xs text-stone-400 hover:text-red-500 whitespace-nowrap"
                                                            >
                                                                삭제
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* 프로젝트 추가·수정 모달 */}
                {showProjModal && (
                    <div
                        className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
                        style={{ marginBottom: "var(--nav-height)" }}
                        onClick={closeProjModal}
                    >
                        <div
                            className="bg-white rounded-t-2xl p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-5">
                                <h2 className="text-base font-bold">
                                    {editProj
                                        ? "프로젝트 수정"
                                        : "프로젝트 추가"}
                                </h2>
                                <button
                                    type="button"
                                    onClick={closeProjModal}
                                    className="text-2xl text-stone-400 leading-none"
                                    aria-label="닫기"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        담당자 (복수 선택)
                                    </label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {MEMBERS.map((name) => {
                                            const on =
                                                projForm.members.includes(name);
                                            return (
                                                <button
                                                    key={name}
                                                    type="button"
                                                    onClick={() =>
                                                        toggleProjMember(name)
                                                    }
                                                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition-colors
                          ${on ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-stone-50"}`}
                                                >
                                                    <Avatar
                                                        name={name}
                                                        size={32}
                                                    />
                                                    <span className="text-[10px] text-stone-600">
                                                        {name.slice(1)}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        프로젝트명{" "}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                        placeholder="예) 사이버견본주택"
                                        value={projForm.name}
                                        onChange={(e) =>
                                            setProjForm({
                                                ...projForm,
                                                name: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        고객사
                                    </label>
                                    <input
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                        placeholder="예) GS건설"
                                        value={projForm.client}
                                        onChange={(e) =>
                                            setProjForm({
                                                ...projForm,
                                                client: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        언어
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {PROJ_LANG_OPTIONS.map((lang) => {
                                            const on =
                                                projForm.languages.includes(
                                                    lang,
                                                );
                                            return (
                                                <button
                                                    key={lang}
                                                    type="button"
                                                    onClick={() =>
                                                        toggleProjLang(lang)
                                                    }
                                                    className={`rounded-xl border-2 py-2.5 text-sm font-medium transition-colors
                          ${on ? "border-amber-500 bg-amber-50 text-stone-800" : "border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300"}`}
                                                >
                                                    {lang}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        PM
                                    </label>
                                    <input
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                        value={projForm.pm}
                                        onChange={(e) =>
                                            setProjForm({
                                                ...projForm,
                                                pm: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        개발자
                                    </label>
                                    <input
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                        value={projForm.developer}
                                        onChange={(e) =>
                                            setProjForm({
                                                ...projForm,
                                                developer: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        디자이너
                                    </label>
                                    <input
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                        value={projForm.designer}
                                        onChange={(e) =>
                                            setProjForm({
                                                ...projForm,
                                                designer: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        빈도
                                    </label>
                                    <input
                                        className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                                        placeholder="예) 월 1-2건, 분기 1-2건, 상시"
                                        value={projForm.frequency}
                                        onChange={(e) =>
                                            setProjForm((f) => ({
                                                ...f,
                                                frequency: e.target.value,
                                            }))
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        이전 담당자
                                    </label>
                                    <input
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                        value={projForm.prev_member}
                                        onChange={(e) =>
                                            setProjForm({
                                                ...projForm,
                                                prev_member: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        비고
                                    </label>
                                    <textarea
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm min-h-[4.5rem] resize-y"
                                        placeholder="예) 분기별 유지보수 포함"
                                        value={projForm.note}
                                        onChange={(e) =>
                                            setProjForm({
                                                ...projForm,
                                                note: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void saveProject()}
                                    className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm"
                                >
                                    {editProj ? "저장하기" : "추가하기"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 접근성 추가·수정 모달 */}
                {showAccModal && (
                    <div
                        className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
                        style={{ marginBottom: "var(--nav-height)" }}
                        onClick={closeAccModal}
                    >
                        <div
                            className="bg-white rounded-t-2xl p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-5">
                                <h2 className="text-base font-bold">
                                    {editAcc ? "접근성 수정" : "접근성 추가"}
                                </h2>
                                <button
                                    type="button"
                                    onClick={closeAccModal}
                                    className="text-2xl text-stone-400 leading-none"
                                    aria-label="닫기"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="space-y-4">
                                {!editAcc && isAdmin && (
                                    <div>
                                        <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                            담당자
                                        </label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {MEMBERS.map((name) => {
                                                const on =
                                                    accForm.accMember === name;
                                                return (
                                                    <button
                                                        key={name}
                                                        type="button"
                                                        onClick={() =>
                                                            setAccForm((f) => ({
                                                                ...f,
                                                                accMember: name,
                                                            }))
                                                        }
                                                        className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition-colors
                          ${on ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-stone-50"}`}
                                                    >
                                                        <Avatar
                                                            name={name}
                                                            size={32}
                                                        />
                                                        <span className="text-[10px] text-stone-600">
                                                            {name.slice(1)}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {!editAcc && !isAdmin && !isGuest && (
                                    <p className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
                                        본인 프로젝트로 등록돼요 (담당자:{" "}
                                        {member})
                                    </p>
                                )}
                                {editAcc && (
                                    <p className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
                                        담당자: {editAcc.member}
                                    </p>
                                )}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5 gap-2">
                                        <label className="text-xs font-medium text-stone-500">
                                            프로젝트명{" "}
                                            <span className="text-red-500">
                                                *
                                            </span>
                                        </label>
                                        <div className="flex bg-stone-100 rounded-lg p-0.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAccProjMode("select");
                                                    setAccForm((f) => ({
                                                        ...f,
                                                        proj: "",
                                                    }));
                                                }}
                                                className={`text-[10px] px-2 py-1 rounded-md font-medium transition-all
                          ${
                              accProjMode === "select"
                                  ? "bg-white text-stone-800 shadow-sm"
                                  : "text-stone-400"
                          }`}
                                            >
                                                목록에서 선택
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAccProjMode("direct");
                                                    setAccForm((f) => ({
                                                        ...f,
                                                        proj: "",
                                                    }));
                                                }}
                                                className={`text-[10px] px-2 py-1 rounded-md font-medium transition-all
                          ${
                              accProjMode === "direct"
                                  ? "bg-white text-stone-800 shadow-sm"
                                  : "text-stone-400"
                          }`}
                                            >
                                                직접 입력
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ minHeight: "42px" }}>
                                        {accProjMode === "select" ? (
                                            <Select
                                                options={accModalProjOptions}
                                                value={
                                                    accForm.proj
                                                        ? {
                                                              value: accForm.proj,
                                                              label: accForm.proj,
                                                          }
                                                        : null
                                                }
                                                onChange={(opt) =>
                                                    setAccForm((f) => ({
                                                        ...f,
                                                        proj: opt?.value ?? "",
                                                    }))
                                                }
                                                placeholder="프로젝트 검색"
                                                isSearchable
                                                styles={accModalSelectStyles}
                                                menuPortalTarget={
                                                    typeof document !==
                                                    "undefined"
                                                        ? document.body
                                                        : null
                                                }
                                                noOptionsMessage={() =>
                                                    "검색 결과가 없어요"
                                                }
                                            />
                                        ) : (
                                            <input
                                                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                                                style={{ height: "42px" }}
                                                placeholder="프로젝트명 직접 입력"
                                                value={accForm.proj}
                                                onChange={(e) =>
                                                    setAccForm((f) => ({
                                                        ...f,
                                                        proj: e.target.value,
                                                    }))
                                                }
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="relative z-20">
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        인증 시작일
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAccEndPicker(false);
                                            setShowAccStartPicker((o) => !o);
                                        }}
                                        className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-all
                      ${showAccStartPicker ? "border-amber-300 ring-2 ring-amber-200" : "border-stone-200 hover:border-stone-300"}`}
                                    >
                                        <span
                                            className={
                                                accForm.start_date
                                                    ? "text-stone-800"
                                                    : "text-stone-400"
                                            }
                                        >
                                            {accForm.start_date
                                                ? (() => {
                                                      const d = new Date(
                                                          accForm.start_date +
                                                              "T00:00:00",
                                                      );
                                                      return `${d.getMonth() + 1}/${d.getDate()}`;
                                                  })()
                                                : "시작일 선택"}
                                        </span>
                                    </button>
                                    {showAccStartPicker &&
                                        typeof document !== "undefined" &&
                                        createPortal(
                                            <div
                                                className="fixed inset-0 z-[200] bg-black/30"
                                                onClick={() =>
                                                    setShowAccStartPicker(false)
                                                }
                                                role="presentation"
                                            >
                                                <div
                                                    className="absolute left-1/2 w-[min(calc(100vw-2rem),36rem)] -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-2xl"
                                                    style={{
                                                        bottom: "max(5.5rem, calc(var(--nav-height, 67px) + 3.5rem))",
                                                    }}
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <div className="flex justify-center overflow-x-auto">
                                                        <DayPicker
                                                            mode="single"
                                                            selected={
                                                                accForm.start_date
                                                                    ? new Date(
                                                                          accForm.start_date +
                                                                              "T00:00:00",
                                                                      )
                                                                    : undefined
                                                            }
                                                            onSelect={(d) => {
                                                                setAccForm(
                                                                    (f) => ({
                                                                        ...f,
                                                                        start_date:
                                                                            d
                                                                                ? toYmd(
                                                                                      d,
                                                                                  )
                                                                                : "",
                                                                    }),
                                                                );
                                                            }}
                                                            locale={ko}
                                                            hideNavigation
                                                            components={{
                                                                MonthCaption:
                                                                    DatePickerCaption,
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="mt-3 flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setAccForm(
                                                                    (f) => ({
                                                                        ...f,
                                                                        start_date:
                                                                            "",
                                                                    }),
                                                                )
                                                            }
                                                            className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                                        >
                                                            초기화
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setShowAccStartPicker(
                                                                    false,
                                                                )
                                                            }
                                                            className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-bold text-white hover:bg-amber-600"
                                                        >
                                                            적용
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>,
                                            document.body,
                                        )}
                                </div>
                                <div className="relative z-20">
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        인증 만료일
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAccStartPicker(false);
                                            setShowAccEndPicker((o) => !o);
                                        }}
                                        className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-all
                      ${showAccEndPicker ? "border-amber-300 ring-2 ring-amber-200" : "border-stone-200 hover:border-stone-300"}`}
                                    >
                                        <span
                                            className={
                                                accForm.end_date
                                                    ? "text-stone-800"
                                                    : "text-stone-400"
                                            }
                                        >
                                            {accForm.end_date
                                                ? (() => {
                                                      const d = new Date(
                                                          accForm.end_date +
                                                              "T00:00:00",
                                                      );
                                                      return `${d.getMonth() + 1}/${d.getDate()}`;
                                                  })()
                                                : "만료일 선택"}
                                        </span>
                                    </button>
                                    {showAccEndPicker &&
                                        typeof document !== "undefined" &&
                                        createPortal(
                                            <div
                                                className="fixed inset-0 z-[200] bg-black/30"
                                                onClick={() =>
                                                    setShowAccEndPicker(false)
                                                }
                                                role="presentation"
                                            >
                                                <div
                                                    className="absolute left-1/2 w-[min(calc(100vw-2rem),36rem)] -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-2xl"
                                                    style={{
                                                        bottom: "max(5.5rem, calc(var(--nav-height, 67px) + 3.5rem))",
                                                    }}
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <div className="flex justify-center overflow-x-auto">
                                                        <DayPicker
                                                            mode="single"
                                                            selected={
                                                                accForm.end_date
                                                                    ? new Date(
                                                                          accForm.end_date +
                                                                              "T00:00:00",
                                                                      )
                                                                    : undefined
                                                            }
                                                            onSelect={(d) => {
                                                                setAccForm(
                                                                    (f) => ({
                                                                        ...f,
                                                                        end_date:
                                                                            d
                                                                                ? toYmd(
                                                                                      d,
                                                                                  )
                                                                                : "",
                                                                    }),
                                                                );
                                                            }}
                                                            locale={ko}
                                                            hideNavigation
                                                            components={{
                                                                MonthCaption:
                                                                    DatePickerCaption,
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="mt-3 flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setAccForm(
                                                                    (f) => ({
                                                                        ...f,
                                                                        end_date:
                                                                            "",
                                                                    }),
                                                                )
                                                            }
                                                            className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                                        >
                                                            초기화
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setShowAccEndPicker(
                                                                    false,
                                                                )
                                                            }
                                                            className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-bold text-white hover:bg-amber-600"
                                                        >
                                                            적용
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>,
                                            document.body,
                                        )}
                                </div>
                                <div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-medium text-stone-500">
                                            접근성 신규
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setAccForm((f) => ({
                                                    ...f,
                                                    is_new: !f.is_new,
                                                }))
                                            }
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${accForm.is_new ? "bg-amber-500" : "bg-stone-200"}`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                        ${accForm.is_new ? "translate-x-6" : "translate-x-1"}`}
                                            />
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        점검 상태
                                    </label>
                                    <div className="relative">
                                        <select
                                            className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none pr-8"
                                            value={accForm.inspection_status}
                                            onChange={(e) =>
                                                setAccForm({
                                                    ...accForm,
                                                    inspection_status:
                                                        e.target.value,
                                                })
                                            }
                                        >
                                            {ACC_INSPECTION_OPTIONS.map((s) => (
                                                <option key={s} value={s}>
                                                    {s}
                                                </option>
                                            ))}
                                        </select>
                                        <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        비고
                                    </label>
                                    <textarea
                                        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm min-h-[4rem] resize-y"
                                        placeholder="예) 기관 일정 조율 중"
                                        value={accForm.note}
                                        onChange={(e) =>
                                            setAccForm({
                                                ...accForm,
                                                note: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void saveAccessibility()}
                                    className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm"
                                >
                                    {editAcc ? "저장하기" : "등록하기"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {toast && (
                    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
                        {toast}
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
