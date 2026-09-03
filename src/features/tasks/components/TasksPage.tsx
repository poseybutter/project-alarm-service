"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { supabase } from "@/infrastructure/supabase/client";
import type { Task } from "@/shared/types";
import { formatWorkload } from "@/shared/utils/utils";
import { useTasksData } from "@/features/tasks/hooks/useTasksData";
import TaskCard from "@/features/tasks/components/TaskCard";
import AddTaskModal from "@/features/tasks/components/AddTaskModal";
import {
    syncTaskToTeamCalendar,
    deleteTaskFromTeamCalendar,
} from "@/features/tasks/api/teamCalendarSync";
import { normalizeStatus } from "@/shared/constants";
import { rpcSetTaskStatus } from "@/features/gamification/maple";
import AuthGuard from "@/components/AuthGuard";
import { useAuth } from "@/components/AuthProvider";
import UserMenu from "@/components/UserMenu";
import TeamSwitcher from "@/components/TeamSwitcher";
import Avatar from "@/components/Avatar";
import LevelUpOverlay from "@/components/LevelUpOverlay";
import ExpPopup, { type ExpPopupType } from "@/components/ExpPopup";
import NotificationButton from "@/components/NotificationButton";
import TaskEditModal from "@/components/TaskEditModal";
import { PageSpinner } from "@/components/Spinner";
import TaskFilters from "@/features/tasks/components/TaskFilters";


/** 업무 목록 페이지. 필터링·그룹화·상태 변경·삭제·경험치 팝업·팀 캘린더 동기화를 조정한다. */
export default function TasksPage() {
    const {
        member: currentMember,
        members,
        memberOptions,
        role,
        teamId,
    } = useAuth();
    const isGuest = role === "guest";
    const canEditOrDelete = (taskMember: string) =>
        role !== "guest" && (role === "admin" || taskMember === currentMember);
    const assignableMembers =
        role === "admin" ? members : [currentMember || ""];

    const { tasks, projects, loading, loadTasks } = useTasksData(teamId);
    const [toast, setToast] = useState("");
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** 토스트 메시지를 3초간 표시한다. 이전 타이머가 있으면 취소 후 새로 시작한다. */
    function showToastMsg(msg: string) {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast(msg);
        toastTimer.current = setTimeout(() => {
            setToast("");
            toastTimer.current = null;
        }, 3000);
    }
    const [showModal, setShowModal] = useState(false);
    const [editTask, setEditTask] = useState<Task | null>(null);

    const [filterMember, setFilterMember] = useState("");
    const [filterProject, setFilterProject] = useState("");
    const [filterPriority, setFilterPriority] = useState("");

    const [levelUpInfo, setLevelUpInfo] = useState({
        show: false,
        level: 0,
        levelName: "",
    });
    const [expPopups, setExpPopups] = useState<
        {
            id: string;
            amount: number;
            x: number;
            y: number;
            type: ExpPopupType;
        }[]
    >([]);
    const expPopupSeq = useRef(0);

    /** 레벨업 오버레이를 닫는다. */
    const closeLevelUp = useCallback(() => {
        setLevelUpInfo((prev) => ({ ...prev, show: false }));
    }, []);

    /** EXP 팝업을 목록에 추가한다. 고유 id는 타임스탬프와 시퀀스 번호로 생성한다. */
    const pushExpPopup = useCallback(
        (amount: number, x: number, y: number, type: ExpPopupType) => {
            expPopupSeq.current += 1;
            const id = `exp-${Date.now()}-${expPopupSeq.current}`;
            setExpPopups((prev) => [...prev, { id, amount, x, y, type }]);
        },
        [],
    );

    /** id 기준으로 EXP 팝업을 목록에서 제거한다. */
    const removeExpPopup = useCallback((id: string) => {
        setExpPopups((prev) => prev.filter((p) => p.id !== id));
    }, []);

    /** 수정 모달을 연다. */
    function openEdit(task: Task) {
        setEditTask(task);
    }

    /** 업무 상태를 변경하고 EXP 획득 시 팝업과 레벨업 오버레이를 표시한다. 변경 후 팀 캘린더 동기화를 fire-and-forget으로 실행한다. */
    async function updateStatus(
        id: number,
        status: string,
        task: Task,
        anchor?: { x: number; y: number },
    ) {
        // 상태 변경과 점수 반영을 서버 RPC 가 한 번에 처리한다
        // (완료·긴급·정시 판정까지 모두 서버에서 결정한다)
        // 권한이 없으면 RPC 가 throw 하므로 null 로 떨어진다
        const result = await rpcSetTaskStatus(id, status, task.member).catch(
            () => null,
        );
        if (!result) {
            showToastMsg("권한이 없어 상태를 변경할 수 없어요");
            return;
        }
        // 완료로 '진입'할 때(sign > 0)만 EXP 팝업과 레벨업 연출을 띄운다
        if (result.scored && result.sign > 0) {
            if (anchor) {
                pushExpPopup(
                    result.amount,
                    anchor.x,
                    anchor.y,
                    task.priority === "긴급" ? "urgent" : "complete",
                );
            }
            if (result.levelUp && result.newLv) {
                setLevelUpInfo({
                    show: true,
                    level: result.newLv.level,
                    levelName: result.newLv.name,
                });
            }
        }
        void syncTaskToTeamCalendar(id).catch((err) => {
            showToastMsg(
                err instanceof Error
                    ? err.message
                    : "팀 캘린더 동기화 실패",
            );
        });
        loadTasks();
    }

    /** 업무를 삭제한다. Supabase 삭제 성공 후 팀 캘린더 일정 삭제를 fire-and-forget으로 실행한다. */
    async function deleteTask(id: number) {
        const { data, error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", id)
            .select();
        if (error || !data || data.length === 0) {
            showToastMsg("권한이 없어 삭제할 수 없어요");
            return;
        }
        // 업무 삭제 성공 후 캘린더 동기화 (실패해도 업무는 이미 삭제됨)
        deleteTaskFromTeamCalendar(id).catch((err) => {
            const msg = err instanceof Error ? err.message : "팀 캘린더 일정 삭제 실패";
            console.warn("[team-calendar] delete failed:", msg);
            showToastMsg(msg);
        });
        loadTasks();
    }

    const filtered = tasks
        .filter((t) => {
            return normalizeStatus(t.status) !== "완료";
        })
        .filter((t) => {
            if (filterMember && t.member !== filterMember) return false;
            if (filterProject && t.proj !== filterProject) return false;
            if (filterPriority && t.priority !== filterPriority) return false;
            return true;
        });

    const grouped = members.reduce(
        (acc, m) => {
            const mt = filtered.filter((t) => t.member === m);
            if (mt.length > 0) acc[m] = mt;
            return acc;
        },
        {} as Record<string, Task[]>,
    );

    const filterProjectSelectOptions = useMemo(
        () =>
            [...new Set(tasks.map((t) => t.proj).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, "ko"))
                .map((p) => ({ value: p, label: p })),
        [tasks],
    );

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f7f6f3]">
                {/* 헤더 */}
                <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                    <div className="max-w-2xl mx-auto flex justify-between items-center">
                        <div>
                            <h1 className="text-base font-bold text-stone-900">
                                업무 관리
                            </h1>
                            <p className="hidden sm:block text-xs text-stone-400 mt-0.5">
                                미완료 업무를 관리하고 리포트 포함 여부를 조정합니다.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <TeamSwitcher />
                            {!isGuest && (
                                <button
                                    onClick={() => setShowModal(true)}
                                    className="bg-amber-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                                >
                                    + 업무
                                </button>
                            )}
                            {/* ?뚮┝ + ?좎?硫붾돱??Header 而댄룷?뚰듃 ?놁씠 吏곸젒 */}

                            <NotificationButton />
                            <UserMenu />
                        </div>
                    </div>
                </div>

                <div className="max-w-2xl mx-auto pb-24">
                    {/* ?꾪꽣 */}
                    <TaskFilters
                        members={members}
                        projectOptions={filterProjectSelectOptions}
                        filterMember={filterMember}
                        filterProject={filterProject}
                        filterPriority={filterPriority}
                        onMemberChange={setFilterMember}
                        onProjectChange={setFilterProject}
                        onPriorityChange={setFilterPriority}
                    />

                    {/* ?낅Т 紐⑸줉 */}
                    {loading ? (
                        <PageSpinner />
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16 text-stone-400 text-sm">
                            업무가 없어요
                        </div>
                    ) : (
                        Object.entries(grouped).map(([member, memberTasks]) => (
                            <div key={member} className="px-4 mb-4">
                                <div className="flex justify-between items-center py-2">
                                    <Avatar name={member} size={26} showName />
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-stone-400">
                                            {memberTasks.length}건
                                        </span>
                                        <span className="text-xs text-amber-600 font-medium">
                                            {formatWorkload(
                                                memberTasks.reduce(
                                                    (s, t) =>
                                                        s + (t.workload || 0),
                                                    0,
                                                ),
                                            )}
                                        </span>
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                                    {memberTasks.map((t, i) => (
                                        <TaskCard
                                            key={t.id}
                                            task={t}
                                            isLast={i === memberTasks.length - 1}
                                            disabled={
                                                isGuest ||
                                                !canEditOrDelete(t.member)
                                            }
                                            canEdit={canEditOrDelete(t.member)}
                                            onStatusChange={(id, status, task, anchor) =>
                                                void updateStatus(
                                                    id,
                                                    status,
                                                    task,
                                                    anchor,
                                                )
                                            }
                                            onEdit={openEdit}
                                            onDelete={deleteTask}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                    <div className="h-24" />
                </div>

                <AddTaskModal
                    open={showModal}
                    onClose={() => setShowModal(false)}
                    teamId={teamId}
                    defaultMember={currentMember || ""}
                    assignableMembers={assignableMembers}
                    memberOptions={memberOptions}
                    projects={projects}
                    onCreated={loadTasks}
                    onToast={showToastMsg}
                />

                <TaskEditModal
                    task={editTask}
                    onClose={() => setEditTask(null)}
                    onSaved={loadTasks}
                    onDelete={deleteTask}
                />

                <LevelUpOverlay
                    show={levelUpInfo.show}
                    level={levelUpInfo.level}
                    levelName={levelUpInfo.levelName}
                    onClose={closeLevelUp}
                />
                {expPopups.map((p) => (
                    <ExpPopup
                        key={p.id}
                        amount={p.amount}
                        x={p.x}
                        y={p.y}
                        type={p.type}
                        onDone={() => removeExpPopup(p.id)}
                    />
                ))}
            </div>

            {/* 토스트 */}
            {toast && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
                    {toast}
                </div>
            )}
        </AuthGuard>
    );
}
