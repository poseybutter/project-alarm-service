import type { SupabaseClient } from "@supabase/supabase-js";

/** EXP 랭킹 조회용 최소 필드 */
export interface RosterEntry {
    id: number;
    name: string;
    exp: number;
}

/**
 * 팀 전체 플레이어, EXP 내림차순.
 * 클라이언트·서버 Supabase 인스턴스 모두 사용 가능 (호출부에서 주입).
 */
export async function getTeamRoster(
    supabase: SupabaseClient,
    teamId: string,
): Promise<RosterEntry[]> {
    const { data, error } = await supabase
        .from("players")
        .select("id, name, exp")
        .eq("team_id", teamId)
        .order("exp", { ascending: false });

    if (error) throw error;
    return data ?? [];
}
