import { supabase } from "@/infrastructure/supabase/client";
import { normalizeProject } from "@/shared/utils/utils";
import type { Project } from "@/shared/types";

export type Quest = {
    id: number;
    player_id?: number | null;
    project_id?: number | null;
    member: string;
    proj: string | null;
    content: string;
    status: string;
    end_date: string | null;
    created_at: string;
};

export type NewQuestInput = {
    member: string;
    playerId: number;
    proj: string | null;
    projectId: number | null;
    content: string;
    endDate: string | null;
    teamId: string;
};

/** 팀 퀘스트 목록 조회 (최신순) */
export async function fetchQuests(teamId: string): Promise<Quest[]> {
    const { data, error } = await supabase
        .from("quests")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as Quest[]) ?? [];
}

/** 퀘스트 연결용 프로젝트 목록 조회 (보관 제외) */
export async function fetchQuestProjects(teamId: string): Promise<Project[]> {
    const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("team_id", teamId)
        .order("name");
    if (error) throw error;
    return (data ?? [])
        .map((row) => normalizeProject(row as Record<string, unknown>))
        .filter((project) => !project.is_archived);
}

export async function insertQuest(input: NewQuestInput): Promise<void> {
    const { error } = await supabase.from("quests").insert([
        {
            member: input.member,
            player_id: input.playerId,
            proj: input.proj,
            project_id: input.projectId,
            content: input.content,
            status: "대기",
            end_date: input.endDate,
            team_id: input.teamId,
        },
    ]);
    if (error) throw error;
}

export async function deleteQuestById(id: number): Promise<void> {
    const { error } = await supabase.from("quests").delete().eq("id", id);
    if (error) throw error;
}
