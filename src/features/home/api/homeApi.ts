import { supabase } from "@/infrastructure/supabase/client";
import { normalizeProject } from "@/shared/utils/utils";
import type { Player, Project, Quest, Task } from "@/shared/types";

// 홈에서 실제로 사용하는 컬럼만 조회 — 전송량·파싱 비용 절감
const TASK_COLS = "id,content,content_items,status,priority,type,proj,issue,workload,start_date,end_date,is_starred,is_plan,is_excluded_today,member,show_on_team_calendar,progress,created_at";
const QUEST_COLS = "id,content,proj,status,end_date,task_id,member,team_id,order_index,created_at";
const PLAYER_COLS = "id,name,exp,month_exp,week_exp,level,icons,attend_last,attend_streak,total_done,urgent_done,on_time_done,avatar_url,team_id";
const PROJECT_COLS = "id,name,members,member,is_archived";

export type HomeData = {
    player: Player | null;
    quests: Quest[];
    myTasks: Task[];
    guestTeamTasks: Task[];
    projects: Project[];
};

/** 홈 화면 데이터 일괄 조회 — 응답 경합·재조회 관리는 TanStack Query 담당 */
export async function fetchHomeData(
    teamId: string,
    member: string,
    isGuest: boolean,
): Promise<HomeData> {
    const [
        { data: playerData },
        { data: questData },
        { data: myTaskData },
        { data: guestTaskData },
        { data: projData },
    ] = await Promise.all([
        supabase
            .from("players")
            .select(PLAYER_COLS)
            .eq("team_id", teamId)
            .eq("name", member)
            .maybeSingle(),
        supabase
            .from("quests")
            .select(QUEST_COLS)
            .eq("team_id", teamId)
            .eq("member", member)
            .neq("status", "완료")
            .order("order_index", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true }),
        supabase
            .from("tasks")
            .select(TASK_COLS)
            .eq("team_id", teamId)
            .eq("member", member)
            .order("end_date", { ascending: true }),
        isGuest
            ? supabase
                  .from("tasks")
                  .select(TASK_COLS)
                  .eq("team_id", teamId)
                  .order("end_date", { ascending: true })
            : Promise.resolve({ data: [] as Task[] }),
        supabase
            .from("projects")
            .select(PROJECT_COLS)
            .eq("team_id", teamId)
            .order("name", { ascending: true }),
    ]);

    return {
        player: (playerData as Player | null) ?? null,
        quests: (questData as Quest[]) || [],
        myTasks: (myTaskData as Task[]) || [],
        guestTeamTasks: (guestTaskData as Task[]) || [],
        projects: (projData || []).map((row) =>
            normalizeProject(row as Record<string, unknown>),
        ),
    };
}
