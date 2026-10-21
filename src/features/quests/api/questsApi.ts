import { supabase } from "@/infrastructure/supabase/client";
import { normalizeProject } from "@/shared/utils/utils";
import type { Project, Quest } from "@/shared/types";

export type { Quest };

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

export async function deleteQuestById(id: number, teamId?: string): Promise<void> {
    let query = supabase.from("quests").delete().eq("id", id);
    if (teamId) query = query.eq("team_id", teamId);
    const { data, error } = await query.select("id");
    if (error) throw error;
    // RLS 로 막히면 error 없이 0행이 삭제되므로 실패로 처리한다
    if (!data || data.length === 0) {
        throw new Error("삭제할 수 있는 퀘스트가 없습니다 (권한 없음 또는 이미 삭제됨)");
    }
}
