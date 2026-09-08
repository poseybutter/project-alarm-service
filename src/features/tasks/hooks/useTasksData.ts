"use client";

import { useEffect, useRef, useState } from "react";
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
    const [loading, setLoading] = useState(true);
    const taskSeqRef = useRef(0);

    /** 팀별 업무 목록을 조회하고 loading 상태를 갱신한다. taskSeqRef로 최신 요청만 setTasks를 실행한다. */
    async function loadTasks(
        requestedTeamId = teamId,
        isCancelled = () => false,
    ) {
        if (!requestedTeamId) return;
        setLoading(true);
        const seq = ++taskSeqRef.current;
        try {
            // 화면(TasksPage)은 완료 업무를 렌더하지 않으므로 서버에서부터
            // 미완료만 가져온다. 완료 업무가 쌓여도 로드가 느려지지 않는다.
            // ('완료' 판정은 normalizeStatus 별칭에 완료 매핑이 없어 동일하다)
            const { data } = await supabase
                .from("tasks")
                .select("*")
                .eq("team_id", requestedTeamId)
                .or("status.is.null,status.neq.완료")
                .order("created_at", { ascending: false });
            if (!isCancelled() && seq === taskSeqRef.current) {
                setTasks(data || []);
            }
        } finally {
            if (!isCancelled() && seq === taskSeqRef.current) setLoading(false);
        }
    }

    /** 팀별 프로젝트 목록을 조회하고 정규화하여 저장한다. */
    async function loadProjects(
        requestedTeamId = teamId,
        isCancelled = () => false,
    ) {
        if (!requestedTeamId) return;
        const { data } = await supabase
            .from("projects")
            .select("*")
            .eq("team_id", requestedTeamId)
            .order("name");
        if (isCancelled()) return;
        setProjects(
            (data || []).map((row) =>
                normalizeProject(row as Record<string, unknown>),
            ),
        );
    }

    useEffect(() => {
        if (!teamId) {
            setTasks([]);
            setProjects([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setTasks([]);
        setProjects([]);
        void loadTasks(teamId, () => cancelled);
        void loadProjects(teamId, () => cancelled);

        const refetchTasks = async () => {
            const seq = ++taskSeqRef.current;
            const { data } = await supabase
                .from("tasks")
                .select("*")
                .eq("team_id", teamId)
                .or("status.is.null,status.neq.완료")
                .order("created_at", { ascending: false });
            if (!cancelled && seq === taskSeqRef.current) setTasks(data || []);
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
    }, [teamId]);

    return { tasks, projects, loading, loadTasks, loadProjects };
}
