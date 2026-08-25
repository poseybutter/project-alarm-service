"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Task, Project } from "@/lib/types";
import { normalizeProject } from "@/lib/utils";

/**
 * 업무·프로젝트 데이터 로딩과 realtime 구독을 담당한다.
 * TasksPage.tsx 에서 분리 — 데이터 계층과 화면 계층을 나눈다.
 */
export function useTasksData(teamId: string | null) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    async function loadTasks(
        requestedTeamId = teamId,
        isCancelled = () => false,
    ) {
        if (!requestedTeamId) return;
        setLoading(true);
        try {
            const { data } = await supabase
                .from("tasks")
                .select("*")
                .eq("team_id", requestedTeamId)
                .order("created_at", { ascending: false });
            if (!isCancelled()) {
                setTasks(data || []);
            }
        } finally {
            if (!isCancelled()) setLoading(false);
        }
    }

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
        if (!teamId) return;
        let cancelled = false;
        void loadTasks(teamId, () => cancelled);
        void loadProjects(teamId, () => cancelled);

        const channel = supabase
            .channel("tasks-changes-" + Math.random())
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "tasks" },
                async () => {
                    const { data } = await supabase
                        .from("tasks")
                        .select("*")
                        .eq("team_id", teamId)
                        .order("created_at", { ascending: false });
                    if (!cancelled) setTasks(data || []);
                },
            )
            .subscribe();

        return () => {
            cancelled = true;
            supabase.removeChannel(channel).catch(console.error);
        };
    }, [teamId]);

    return { tasks, projects, loading, loadTasks, loadProjects };
}
