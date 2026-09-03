"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import { supabase } from "@/infrastructure/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import AuthGuard from "@/components/AuthGuard";
import UserMenu from "@/components/UserMenu";
import TeamSwitcher from "@/components/TeamSwitcher";
import NotificationButton from "@/components/NotificationButton";
import { DatePickerCaption } from "@/components/DatePickerCaption";
import Avatar from "@/components/Avatar";

import { PageSpinner } from "@/components/Spinner";
import type { Accessibility, Project } from "@/shared/types";
import {
    findProjectId,
    findTeamMemberId,
    getDiff,
    normalizeProject,
    getProjectMembers,
} from "@/shared/utils/utils";
import Select from "react-select";
import {
    selectStyles,
    taskFilterProjectSelectStyles,
    modalFormSelectStyles,
    badgeSelectStyles,
} from "@/shared/styles/reactSelectStyles";
import { toLocalYmd } from "@/shared/utils/toLocalYmd";

const MAINTENANCE_STATUS_URL =
    process.env.NEXT_PUBLIC_MAINTENANCE_STATUS_URL?.trim() ?? "";

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

const ACC_OPTIONS = ACC_INSPECTION_OPTIONS.map((s) => ({
    value: s,
    label: s,
}));

function accMissionSnoozeKeys(
    row: Accessibility,
    status: string,
    kind: "apply" | "missing_schedule" | "result" | "renewal",
) {
    return [
        `${row.id}:${status}:${kind}`,
        `${row.id}:${status}:${row.end_date ?? ""}:${kind}`,
    ];
}

function formatAccStatusUpdatedAt(value?: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(date);
}

function accStatusAuditPayload(
    row: Accessibility | null,
    nextStatus: string,
    actor: string | null | undefined,
) {
    const previousStatus = row?.inspection_status ?? null;
    if (previousStatus === nextStatus) return {};
    return {
        previous_inspection_status: previousStatus,
        status_updated_at: new Date().toISOString(),
        status_updated_by: actor ?? null,
    };
}

function notifyAccessibilityChanged() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("accessibility:changed"));
}

function AccInspectionBadgeSelect({
    status,
    disabled,
    onChange,
}: {
    status: string;
    disabled: boolean;
    onChange: (next: string) => void;
}) {
    return (
        <div
            className={`rounded-lg ${accStatusStyle(status)} ${disabled ? "opacity-70 cursor-not-allowed" : ""}`}
        >
            <Select
                options={ACC_OPTIONS}
                value={{ value: status, label: status }}
                isDisabled={disabled}
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

export default function ManagePage() {
    const { member, members, memberOptions, role, teamId } = useAuth();
    const isGuest = member === "GUEST" || role === "guest";
    const isAdmin = role === "admin";

    const [manageTab, setManageTab] = useState<"project" | "accessibility">(
        () =>
            typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("tab") ===
                "accessibility"
                ? "accessibility"
                : "project",
    );
    const [projects, setProjects] = useState<Project[]>([]);
    const [accessibility, setAccessibility] = useState<Accessibility[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [toast, setToast] = useState("");
    const [deleteTarget, setDeleteTarget] = useState<{
        type: "project" | "accessibility";
        id: number;
        name: string;
    } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const loadGenerationRef = useRef(0);

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
    const [showArchived, setShowArchived] = useState(false);
    const [searchAcc, setSearchAcc] = useState("");
    const [filterAccMember, setFilterAccMember] = useState("");
    const [filterAccStatus, setFilterAccStatus] = useState("");
    const [sortAcc, setSortAcc] = useState<
        "날짜순" | "가나다순" | "담당자순"
    >("날짜순");
    const [showAccStartPicker, setShowAccStartPicker] = useState(false);
    const [showAccEndPicker, setShowAccEndPicker] = useState(false);
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

    // loadData를 useEffect보다 먼저 선언 (react-hooks/immutability)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 데이터 로딩 effect
    const loadData = useCallback(async () => {
        if (!teamId) return;
        const generation = ++loadGenerationRef.current;
        setLoading(true);
        setLoadError(null);
        let projData, accData;
        try {
            const [projResult, accResult] = await Promise.all([
                supabase
                    .from("projects")
                    .select("*")
                    .eq("team_id", teamId)
                    .order("name", { ascending: true }),
                supabase
                    .from("accessibility")
                    .select("*")
                    .eq("team_id", teamId)
                    .order("end_date", { ascending: true }),
            ]);
            if (projResult.error) throw projResult.error;
            if (accResult.error) throw accResult.error;
            projData = projResult.data;
            accData = accResult.data;
        } catch (err) {
            if (generation === loadGenerationRef.current) {
                setLoadError(
                    err instanceof Error
                        ? err.message
                        : "데이터를 불러오지 못했습니다.",
                );
                setLoading(false);
            }
            return;
        } finally {
            if (generation === loadGenerationRef.current) setLoading(false);
        }
        if (generation !== loadGenerationRef.current) return;
        setProjects(
            (projData || []).map((row) =>
                normalizeProject(row as Record<string, unknown>),
            ),
        );
        const normalizedAccessibility = (accData || []).map((row) => ({
                ...row,
                inspection_status:
                    row.inspection_status === "미신청"
                        ? "신청필요"
                        : row.inspection_status === "갱신완료"
                          ? "취득·갱신완료"
                          : row.inspection_status,
                is_new: row.is_new ?? false,
            })) as Accessibility[];
        setAccessibility(normalizedAccessibility);

        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const accId = Number(params.get("accId"));
            const row = normalizedAccessibility.find((item) => item.id === accId);
            if (row) {
                setManageTab("accessibility");
                openAccModalForEdit(row);
                params.delete("accId");
                const query = params.toString();
                window.history.replaceState(
                    {},
                    "",
                    query ? `/manage?${query}` : "/manage",
                );
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamId]);

    useEffect(() => {
        if (member && teamId) void loadData();
    }, [member, teamId, loadData]);

    useEffect(() => {
        function handleAccessibilityChanged() {
            void loadData();
        }

        window.addEventListener(
            "accessibility:changed",
            handleAccessibilityChanged,
        );
        return () =>
            window.removeEventListener(
                "accessibility:changed",
                handleAccessibilityChanged,
            );
    }, [loadData]);

    const projNameOptions = useMemo(
        () =>
            projects
                .filter((p) => showArchived || !p.is_archived)
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((p) => ({ value: p.name, label: p.name })),
        [projects, showArchived],
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
            if (!teamId) return;
            const { error } = await supabase.from("projects").insert([{ ...payload, team_id: teamId }]);
            if (error) {
                alert("추가 실패: " + error.message);
                return;
            }
        }
        closeProjModal();
        await loadData();
    }

    function deleteProject(id: number) {
        if (isGuest) return;
        const proj = projects.find((p) => p.id === id);
        setDeleteTarget({
            type: "project",
            id,
            name: proj?.name ?? `프로젝트 #${id}`,
        });
    }

    function openAccModalForAdd() {
        setEditAcc(null);
        setShowAccStartPicker(false);
        setShowAccEndPicker(false);
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
        setAccForm({ ...emptyAccForm });
    }

    async function saveAccessibility() {
        if (!accForm.proj) return alert("프로젝트명은 필수예요");
        if (isGuest) return;
        const selectedProjectId = findProjectId(projects, accForm.proj);
        if (selectedProjectId === null) {
            showToastMsg("현재 팀의 프로젝트를 다시 선택해주세요");
            return;
        }

        if (editAcc) {
            const selectedPlayerId =
                editAcc.player_id ??
                findTeamMemberId(memberOptions, editAcc.member);
            if (selectedPlayerId === null) {
                showToastMsg("현재 팀의 담당자를 다시 선택해주세요");
                return;
            }
            const canChangeStatus = await prepareAccStatusTransition(
                editAcc,
                accForm.inspection_status,
            );
            if (!canChangeStatus) return;
            const { error } = await supabase
                .from("accessibility")
                .update({
                    proj: accForm.proj,
                    project_id: selectedProjectId,
                    player_id: selectedPlayerId,
                    start_date: accForm.start_date || null,
                    end_date: accForm.end_date || null,
                    inspection_status: accForm.inspection_status,
                    ...accStatusAuditPayload(
                        editAcc,
                        accForm.inspection_status,
                        member,
                    ),
                    note: accForm.note || null,
                    is_new: accForm.is_new,
                })
                .eq("team_id", teamId)
                .eq("id", editAcc.id);
            if (error) {
                showToastMsg("저장 실패: " + error.message);
                return;
            }
        } else {
            const assignee =
                role === "admin" ? accForm.accMember : member ?? "";
            const selectedPlayerId = findTeamMemberId(
                memberOptions,
                assignee,
            );
            if (selectedPlayerId === null) {
                showToastMsg("현재 팀의 담당자를 다시 선택해주세요");
                return;
            }
            const { error } = await supabase.from("accessibility").insert([
                {
                    proj: accForm.proj,
                    project_id: selectedProjectId,
                    member: assignee,
                    player_id: selectedPlayerId,
                    start_date: accForm.start_date || null,
                    end_date: accForm.end_date || null,
                    note: accForm.note || null,
                    inspection_status: accForm.inspection_status || "신청필요",
                    previous_inspection_status: null,
                    status_updated_at: new Date().toISOString(),
                    status_updated_by: member ?? null,
                    is_new: accForm.is_new,
                    team_id: teamId,
                },
            ]);
            if (error) {
                showToastMsg("등록 실패: " + error.message);
                return;
            }
        }
        closeAccModal();
        await loadData();
        notifyAccessibilityChanged();
    }

    async function prepareAccStatusTransition(
        row: Accessibility,
        nextStatus: string,
    ) {
        if (row.inspection_status === nextStatus) return true;
        if (nextStatus === "신청필요") {
            const res = await fetch("/api/accessibility-mission-snoozes", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    teamId,
                    accessibilityId: row.id,
                    keys: [
                        ...accMissionSnoozeKeys(row, "신청필요", "apply"),
                        ...accMissionSnoozeKeys(
                            row,
                            "신청필요",
                            "missing_schedule",
                        ),
                    ],
                }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                showToastMsg(
                    json.message || "접근성 미션 다시 알림 해제에 실패했어요",
                );
                return false;
            }
        }
        if (nextStatus === "취득·갱신완료") {
            const res = await fetch("/api/accessibility-mission-snoozes", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    teamId,
                    accessibilityId: row.id,
                    keys: accMissionSnoozeKeys(
                        row,
                        "취득·갱신완료",
                        "renewal",
                    ),
                }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                showToastMsg(
                    json.message || "접근성 미션 다시 알림 해제에 실패했어요",
                );
                return false;
            }
        }
        if (nextStatus === "신청완료") {
            const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
            // eslint-disable-next-line react-hooks/purity -- 이벤트 핸들러 내부 호출
            const snoozedUntil = new Date(Date.now() + TWO_WEEKS_MS).toISOString();
            const res = await fetch("/api/accessibility-mission-snoozes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    teamId,
                    accessibilityId: row.id,
                    keys: [`${row.id}:신청완료:result`],
                    snoozedUntil,
                }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                showToastMsg(
                    json.message || "접근성 미션 다시 알림 저장에 실패했어요",
                );
                return false;
            }
        }
        return true;
    }

    async function updateAccStatus(id: number, status: string) {
        const row = accessibility.find((a) => a.id === id);
        if (!row) return;
        const can = !isGuest;
        if (!can) return;
        const canChangeStatus = await prepareAccStatusTransition(row, status);
        if (!canChangeStatus) return;
        const { error } = await supabase
            .from("accessibility")
            .update({
                inspection_status: status,
                ...accStatusAuditPayload(row, status, member),
            })
            .eq("team_id", teamId)
            .eq("id", id);
        if (error) {
            showToastMsg(error.message || "상태 변경에 실패했어요");
            return;
        }
        await loadData();
        notifyAccessibilityChanged();
    }

    function deleteAcc(id: number) {
        const row = accessibility.find((a) => a.id === id);
        if (!row) return;
        if (isGuest) return;
        setDeleteTarget({
            type: "accessibility",
            id,
            name: row.proj ?? `접근성 #${id}`,
        });
    }

    async function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            // Supabase는 실패 시 throw 대신 { error }를 반환하므로 명시적으로 확인한다
            if (deleteTarget.type === "project") {
                const { error } = await supabase
                    .from("projects")
                    .delete()
                    .eq("id", deleteTarget.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("accessibility")
                    .delete()
                    .eq("id", deleteTarget.id);
                if (error) throw error;
                notifyAccessibilityChanged();
            }
            setDeleteTarget(null);
            await loadData();
        } catch {
            showToastMsg("삭제에 실패했습니다.");
        } finally {
            setDeleting(false);
        }
    }

    async function toggleArchive(id: number, current: boolean) {
        await supabase
            .from("projects")
            .update({ is_archived: !current })
            .eq("id", id);
        await loadData();
    }

    const filteredProjects = projects
        .filter((p) => {
            if (!showArchived && p.is_archived) return false;
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

    const canEditRowAcc = () => !isGuest;

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f7f6f3] pb-24">
                <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                    <div className="max-w-2xl mx-auto flex justify-between items-center gap-2">
                        <h1 className="text-base font-bold text-stone-900 shrink-0">
                            관리
                        </h1>
                        <div className="flex items-center gap-2 shrink-0">
                            <TeamSwitcher />
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

                    {teamId === "ud2" && (
                        <a
                            href="https://docs.google.com/spreadsheets/d/1ACScLXCcap3Vvz9eH7sXX0yOcZKcV8blH53h6C63ObE/edit?gid=1191028141#gid=1191028141"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mb-4 flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-50 hover:border-amber-300"
                        >
                            퍼블팀 웹접근성 및 유지보수 현황 엑셀 바로가기
                            <i className="ri-external-link-line text-amber-500" aria-hidden />
                        </a>
                    )}

                    {loading ? (
                        <PageSpinner />
                    ) : loadError ? (
                        <div className="mx-4 mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-center">
                            <p className="text-sm text-red-700">{loadError}</p>
                            <button
                                type="button"
                                className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                                onClick={() => void loadData()}
                            >
                                다시 시도
                            </button>
                        </div>
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
                                        styles={taskFilterProjectSelectStyles}
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
                                <div className="min-w-0 shrink max-w-[38%] sm:max-w-none">
                                    <Select
                                        aria-label="담당자 필터"
                                        options={members.map((m) => ({
                                            value: m,
                                            label: m,
                                        }))}
                                        value={
                                            filterProjMember
                                                ? {
                                                      value: filterProjMember,
                                                      label: filterProjMember,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setFilterProjMember(
                                                opt?.value ?? "",
                                            )
                                        }
                                        placeholder="전체 담당자"
                                        isClearable
                                        isSearchable={false}
                                        styles={taskFilterProjectSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                    />
                                </div>
                                <div className="min-w-0 shrink max-w-[38%] sm:max-w-none">
                                    <Select
                                        aria-label="언어 필터"
                                        options={[
                                            { value: "JSP", label: "JSP" },
                                            { value: "PHP", label: "PHP" },
                                            { value: "기타", label: "기타" },
                                        ]}
                                        value={
                                            filterProjLang
                                                ? {
                                                      value: filterProjLang,
                                                      label: filterProjLang,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setFilterProjLang(opt?.value ?? "")
                                        }
                                        placeholder="전체 언어"
                                        isClearable
                                        isSearchable={false}
                                        styles={taskFilterProjectSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <span className="text-xs text-stone-400 shrink-0">
                                    총 {filteredProjects.length}개
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                    {MAINTENANCE_STATUS_URL && (
                                        <a
                                            href={MAINTENANCE_STATUS_URL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                                        >
                                            <span className="hidden sm:inline">
                                                통합 유지보수 현황
                                            </span>
                                            <span className="sm:hidden">유지보수 현황</span>
                                            <span aria-hidden="true">↗</span>
                                        </a>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowArchived((v) => !v)
                                        }
                                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all
    ${showArchived ? "bg-stone-800 text-white border-stone-800" : "bg-white text-stone-500 border-stone-200"}`}
                                    >
                                        {showArchived
                                            ? "보관함 숨기기"
                                            : `보관함 (${projects.filter((p) => p.is_archived).length})`}
                                    </button>
                                    <div className="min-w-[7rem]">
                                        <Select
                                            aria-label="정렬"
                                            options={[
                                                { value: "가나다", label: "가나다순" },
                                                { value: "담당자", label: "담당자순" },
                                            ]}
                                            value={{
                                                value: sortProj,
                                                label:
                                                    sortProj === "가나다"
                                                        ? "가나다순"
                                                        : "담당자순",
                                            }}
                                            onChange={(opt) => {
                                                if (!opt) return;
                                                setSortProj(
                                                    opt.value as
                                                        | "가나다"
                                                        | "담당자",
                                                );
                                            }}
                                            isSearchable={false}
                                            isClearable={false}
                                            styles={taskFilterProjectSelectStyles}
                                            menuPortalTarget={
                                                typeof document !== "undefined"
                                                    ? document.body
                                                    : null
                                            }
                                        />
                                    </div>
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
                                            className={`bg-white rounded-xl border border-stone-200 overflow-hidden mb-2
    ${p.is_archived ? "opacity-50" : ""}`}
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
                                                    {!isGuest && (
                                                        <div className="flex gap-2 mt-3 pt-2 border-t border-stone-100">
                                                            <button type="button" onClick={() => openProjModalForEdit(p)} className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-medium text-white hover:bg-amber-600 transition-colors">수정</button>
                                                            <button type="button" onClick={() => void deleteProject(p.id)} className="flex-1 rounded-lg border border-red-300 py-2 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors">삭제</button>
                                                            <button type="button" onClick={() => void toggleArchive(p.id, p.is_archived ?? false)} className="flex-1 rounded-lg bg-stone-700 py-2 text-xs font-medium text-white hover:bg-stone-800 transition-colors">{p.is_archived ? "복원" : "보관"}</button>
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
                                        styles={taskFilterProjectSelectStyles}
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
                                <div className="min-w-0 shrink">
                                    <Select
                                        aria-label="담당자 필터"
                                        options={members.map((m) => ({
                                            value: m,
                                            label: m,
                                        }))}
                                        value={
                                            filterAccMember
                                                ? {
                                                      value: filterAccMember,
                                                      label: filterAccMember,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setFilterAccMember(
                                                opt?.value ?? "",
                                            )
                                        }
                                        placeholder="전체 담당자"
                                        isClearable
                                        isSearchable={false}
                                        styles={taskFilterProjectSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                    />
                                </div>
                                <div className="min-w-0 shrink">
                                    <Select
                                        aria-label="점검 상태 필터"
                                        options={[
                                            {
                                                value: "신청필요",
                                                label: "신청필요",
                                            },
                                            {
                                                value: "신청완료",
                                                label: "신청완료",
                                            },
                                            {
                                                value: "취득·갱신완료",
                                                label: "취득·갱신완료",
                                            },
                                            {
                                                value: "신청불필요",
                                                label: "신청불필요",
                                            },
                                        ]}
                                        value={
                                            filterAccStatus
                                                ? {
                                                      value: filterAccStatus,
                                                      label: filterAccStatus,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setFilterAccStatus(
                                                opt?.value ?? "",
                                            )
                                        }
                                        placeholder="전체 상태"
                                        isClearable
                                        isSearchable={false}
                                        styles={taskFilterProjectSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                    />
                                </div>
                            </div>
                            <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-stone-600">
                                <p className="font-bold text-stone-800">
                                    접근성 미션 알림 기준
                                </p>
                                <ul className="mt-2 list-disc space-y-1 pl-5">
                                    <li>
                                        취득·갱신완료 상태에서 만료 D-45가 되면 신청필요로 바꾸라고 안내합니다.
                                    </li>
                                    <li>
                                        신청필요 상태가 되면 신청을 진행했는지 확인하고, 신청완료로 변경하라고 안내합니다.
                                    </li>
                                    <li>
                                        신청완료로 변경한 뒤 14일 후 취득·갱신완료 처리와 만료일 업데이트를 안내합니다.
                                    </li>
                                    <li className="text-stone-500">
                                        7일 뒤 다시 알림은 선택한 접근성 항목에만 적용됩니다.
                                    </li>
                                </ul>
                            </div>
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-xs text-stone-400">
                                    총 {filteredAcc.length}개
                                </span>
                                <div className="min-w-[7rem]">
                                    <Select
                                        aria-label="접근성 정렬"
                                        options={[
                                            { value: "날짜순", label: "날짜순" },
                                            { value: "가나다순", label: "가나다순" },
                                            { value: "담당자순", label: "담당자순" },
                                        ]}
                                        value={{
                                            value: sortAcc,
                                            label: sortAcc,
                                        }}
                                        onChange={(opt) => {
                                            if (!opt) return;
                                            setSortAcc(
                                                opt.value as
                                                    | "날짜순"
                                                    | "가나다순"
                                                    | "담당자순",
                                            );
                                        }}
                                        isSearchable={false}
                                        isClearable={false}
                                        styles={taskFilterProjectSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                    />
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
                                        const isSkipped =
                                            a.inspection_status ===
                                            "신청불필요";
                                        const isDueWithin45 =
                                            diff !== null &&
                                            diff <= 45 &&
                                            !isSkipped;
                                        const canRow = canEditRowAcc();
                                        return (
                                            <div
                                                key={a.id}
                                                role={canRow ? "button" : undefined}
                                                tabIndex={canRow ? 0 : undefined}
                                                className={`px-4 py-3 transition-colors
                      ${isSkipped ? "bg-stone-50 opacity-70" : isUrgent ? "bg-red-50" : isWarning ? "bg-amber-50" : ""}
                      ${i < filteredAcc.length - 1 ? "border-b border-stone-100" : ""}
                      ${canRow ? "cursor-pointer hover:bg-stone-50/60" : ""}`}
                                                onClick={() => canRow && openAccModalForEdit(a)}
                                                onKeyDown={(e) => {
                                                    if (canRow && (e.key === "Enter" || e.key === " ")) {
                                                        e.preventDefault();
                                                        openAccModalForEdit(a);
                                                    }
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Avatar name={a.member} size={24} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {a.is_new && (
                                                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-bold shrink-0">NEW</span>
                                                            )}
                                                            <p className="text-sm font-medium text-stone-800 truncate">{a.proj}</p>
                                                        </div>
                                                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-stone-400">
                                                            <i className="ri-history-line text-xs" aria-hidden />
                                                            <span className="min-w-0 truncate">
                                                                {a.status_updated_at
                                                                    ? `상태 변경: ${a.previous_inspection_status ? `${a.previous_inspection_status} → ` : ""}${a.inspection_status} · ${formatAccStatusUpdatedAt(a.status_updated_at)}${a.status_updated_by ? ` · ${a.status_updated_by}` : ""}`
                                                                    : `상태 기록 없음 · 현재 ${a.inspection_status}`}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 flex w-full items-center justify-between text-xs text-stone-400">
                                                            <div className="flex items-center gap-2">
                                                                {a.end_date && (
                                                                    <span className={isDueWithin45 ? "text-red-500 font-bold" : ""}>
                                                                        만료: {a.end_date.slice(0, 10)}
                                                                        {diff !== null && ` (${diff < 0 ? "기한초과 " + Math.abs(diff) + "일" : "D-" + diff})`}
                                                                    </span>
                                                                )}
                                                                {a.note && <span className="truncate">· {a.note}</span>}
                                                            </div>
                                                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                <AccInspectionBadgeSelect
                                                                    status={a.inspection_status}
                                                                    disabled={!canRow}
                                                                    onChange={(next) => void updateAccStatus(a.id, next)}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
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
                            className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
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
                                        {members.map((name) => {
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
                            className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
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
                                            {members.map((name) => {
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
                                    <label className="text-xs font-medium text-stone-500 block mb-1.5">
                                        프로젝트명{" "}
                                        <span className="text-red-500">*</span>
                                    </label>
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
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                        noOptionsMessage={() =>
                                            "검색 결과가 없어요"
                                        }
                                    />
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
                                                                                ? toLocalYmd(
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
                                                                                ? toLocalYmd(
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
                                    <Select
                                        options={ACC_OPTIONS}
                                        value={{
                                            value: accForm.inspection_status,
                                            label: accForm.inspection_status,
                                        }}
                                        onChange={(opt) => {
                                            if (!opt) return;
                                            setAccForm({
                                                ...accForm,
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
                                {editAcc ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void deleteAcc(editAcc.id);
                                                closeAccModal();
                                            }}
                                            className="rounded-xl border border-red-300 bg-white py-3.5 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                                        >
                                            삭제하기
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void saveAccessibility()}
                                            className="bg-stone-800 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-stone-900 transition-colors"
                                        >
                                            저장하기
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void saveAccessibility()}
                                        className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm"
                                    >
                                        등록하기
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {deleteTarget &&
                    createPortal(
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                            onClick={() => !deleting && setDeleteTarget(null)}
                        >
                            <div
                                className="mx-4 w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="text-base font-bold text-stone-900">
                                    삭제 확인
                                </h3>
                                <p className="mt-2 text-sm text-stone-600">
                                    <strong>{deleteTarget.name}</strong>
                                    {deleteTarget.type === "project"
                                        ? " 프로젝트를"
                                        : " 접근성 항목을"}{" "}
                                    삭제할까요?
                                </p>
                                <p className="mt-1 text-xs text-red-600">
                                    이 작업은 되돌릴 수 없습니다.
                                </p>
                                <div className="mt-4 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        className="rounded-lg border border-stone-300 px-4 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
                                        onClick={() => setDeleteTarget(null)}
                                        disabled={deleting}
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                                        onClick={() => void confirmDelete()}
                                        disabled={deleting}
                                    >
                                        {deleting ? "삭제 중…" : "삭제"}
                                    </button>
                                </div>
                            </div>
                        </div>,
                        document.body,
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
