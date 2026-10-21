"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/infrastructure/supabase/client";
import type { Task, Project } from "@/shared/types";
import { normalizeProject } from "@/shared/utils/utils";

/**
 * 업무·프로젝트 데이터 로딩과 realtime 구독을 담당한다.
 * TasksPage.tsx 에서 분리 — 데이터 계층과 화면 계층을 나눈다.
 */
export function useTasksData(teamId: string | null) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(Boolean(teamId));
    // 조회 실패를 빈 목록으로 오인하지 않도록 오류를 별도로 노출한다
    const [taskError, setTaskError] = useState<string | null>(null);
    const [projectError, setProjectError] = useState<string | null>(null);
    const taskSeqRef = useRef(0);

    // 팀 변경 시 렌더 중에 목록·로딩 상태 초기화 (effect 의 동기 setState 금지)
    const [prevTeamId, setPrevTeamId] = useState(teamId);
    if (prevTeamId !== teamId) {
        setPrevTeamId(teamId);
        setTasks([]);
        setProjects([]);
        setLoading(Boolean(teamId));
        setTaskError(null);
        setProjectError(null);
    }

    /** effect 경로용 업무 조회 — setState 는 모두 await 이후. taskSeqRef로 최신 요청만 setTasks를 실행한다. */
    const fetchTasks = useCallback(
        async (requestedTeamId = teamId, isCancelled: () => boolean = () => false) => {
            if (!requestedTeamId) return;
            const seq = ++taskSeqRef.current;
            try {
                // 화면(TasksPage)은 완료 업무를 렌더하지 않으므로 서버에서부터
                // 미완료만 가져온다. 완료 업무가 쌓여도 로드가 느려지지 않는다.
                // ('완료' 판정은 normalizeStatus 별칭에 완료 매핑이 없어 동일하다)
                const { data, error: tasksError } = await supabase
                    .from("tasks")
                    .select("*")
                    .eq("team_id", requestedTeamId)
                    .or("status.is.null,status.neq.완료")
                    .order("created_at", { ascending: false });
                if (!isCancelled() && seq === taskSeqRef.current) {
                    if (tasksError) {
                        // 실패 시 기존 목록은 유지하고 오류만 표시한다
                        setTaskError("업무 목록을 불러오지 못했어요");
                    } else {
                        setTaskError(null);
                        setTasks(data || []);
                    }
                }
            } catch {
                if (!isCancelled() && seq === taskSeqRef.current) {
                    setTaskError("업무 목록을 불러오지 못했어요");
                }
            } finally {
                if (!isCancelled() && seq === taskSeqRef.current) setLoading(false);
            }
        },
        [teamId],
    );

    /** 외부(핸들러) 호출용 — 로딩 표시 후 업무 목록을 재조회한다. */
    const loadTasks = useCallback(
        async (requestedTeamId = teamId, isCancelled: () => boolean = () => false) => {
            if (!requestedTeamId) return;
            setLoading(true);
            await fetchTasks(requestedTeamId, isCancelled);
        },
        [teamId, fetchTasks],
    );

    /** 팀별 프로젝트 목록을 조회하고 정규화하여 저장한다. setState 는 모두 await 이후. */
    const loadProjects = useCallback(
        async (requestedTeamId = teamId, isCancelled: () => boolean = () => false) => {
            if (!requestedTeamId) return;
            const { data, error: projectsError } = await supabase
                .from("projects")
                .select("*")
                .eq("team_id", requestedTeamId)
                .order("name");
            if (isCancelled()) return;
            if (projectsError) {
                // 프로젝트가 없으면 업무 추가·수정이 막히므로 오류로 알린다
                setProjectError("프로젝트 목록을 불러오지 못했어요");
                return;
            }
            setProjectError(null);
            setProjects(
                (data || []).map((row) =>
                    normalizeProject(row as Record<string, unknown>),
                ),
            );
        },
        [teamId],
    );

    useEffect(() => {
        if (!teamId) return;
        let cancelled = false;
        void (async () => {
            await fetchTasks(teamId, () => cancelled);
        })();
        void (async () => {
            await loadProjects(teamId, () => cancelled);
        })();

        const refetchTasks = async () => {
            const seq = ++taskSeqRef.current;
            const { data, error: tasksError } = await supabase
                .from("tasks")
                .select("*")
                .eq("team_id", teamId)
                .or("status.is.null,status.neq.완료")
                .order("created_at", { ascending: false });
            if (cancelled || seq !== taskSeqRef.current) return;
            // 실시간 재조회 실패는 기존 목록을 유지한다 (빈 목록으로 덮어쓰지 않음)
            if (tasksError) return;
            setTasks(data || []);
        };

        // 다른 팀의 변경까지 받으면 팀 수에 비례해 불필요한 리페치가 생기므로
        // INSERT/UPDATE 는 팀으로 필터한다. DELETE 페이로드에는 PK 만 있어
        // 필터를 걸면 이벤트가 아예 오지 않으므로 무필터로 받는다.
        // (리페치 쿼리가 팀 스코프라 정확성은 유지된다)
        const teamFilter = `team_id=eq.${teamId}`;
        const channel = supabase
            .channel("tasks-changes-" + Math.random())
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "tasks", filter: teamFilter },
                refetchTasks,
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "tasks", filter: teamFilter },
                refetchTasks,
            )
            .on(
                "postgres_changes",
                { event: "DELETE", schema: "public", table: "tasks" },
                refetchTasks,
            )
            .subscribe();

        return () => {
            cancelled = true;
            supabase.removeChannel(channel).catch(console.error);
        };
    }, [teamId, fetchTasks, loadProjects]);

    /** 오류 화면의 "다시 시도" — 업무·프로젝트를 함께 재조회한다. */
    const retry = useCallback(async () => {
        if (!teamId) return;
        await Promise.all([loadTasks(teamId), loadProjects(teamId)]);
    }, [teamId, loadTasks, loadProjects]);

    const error = taskError ?? projectError;

    return { tasks, projects, loading, error, loadTasks, loadProjects, retry };
}
