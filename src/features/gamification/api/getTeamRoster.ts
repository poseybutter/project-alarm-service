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
 *
 * team_memberships 기준 조회 — players.team_id는 기본 소속에만 동기화되는
 * 필드라, 그 팀이 사용자의 두 번째 이상 소속이면 players.team_id가 다른
 * 팀을 가리켜서 조회에서 누락된다. gamification 데이터(exp 등)는 players에만
 * 있으므로 legacy_player_id로 조인한다 — 없는 멤버십(신규 가입자)은
 * 대상에서 빠진다.
 */
export async function getTeamRoster(
    supabase: SupabaseClient,
    teamId: string,
): Promise<RosterEntry[]> {
    const { data: memberships, error: membershipError } = await supabase
        .from("team_memberships")
        .select("legacy_player_id")
        .eq("team_id", teamId)
        .eq("status", "active")
        .not("legacy_player_id", "is", null);
    if (membershipError) throw membershipError;

    const playerIds = (memberships ?? [])
        .map((m) => m.legacy_player_id as number | null)
        .filter((id): id is number => typeof id === "number");
    if (playerIds.length === 0) return [];

    const { data, error } = await supabase
        .from("players")
        .select("id, name, exp")
        .in("id", playerIds)
        .order("exp", { ascending: false });

    if (error) throw error;
    return data ?? [];
}
