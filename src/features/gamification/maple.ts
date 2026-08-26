import { supabase } from "@/lib/supabase";
import { sendLevelUpMessage } from "@/lib/googleChat";
import { LEVELS } from "./levels";

export { LEVELS } from "./levels";

export const EXP_REWARDS = {
    COMPLETE: 50,
    URGENT: 100,
    ATTEND: 20,
    QUEST: 10,
};

export function calcLevel(exp: number) {
    let lv: (typeof LEVELS)[number] = LEVELS[0];
    for (const l of LEVELS) {
        if (exp >= l.exp) lv = l;
        else break;
    }
    return lv;
}

export function getNextLevel(exp: number) {
    return LEVELS.find((l) => l.exp > exp) || null;
}

export function expBar(exp: number) {
    const lv = calcLevel(exp);
    const next = getNextLevel(exp);
    if (!next) return 100;
    return Math.round(((exp - lv.exp) / (next.exp - lv.exp)) * 100);
}

// =============================================================================
// 점수(EXP/레벨/잔디/출석)는 DB 의 SECURITY DEFINER RPC 가 단일 출처다(V12).
// 클라이언트는 아래 래퍼로 RPC 만 호출하고, players 점수 컬럼을 직접 쓰지 않는다.
// 레벨 임계값(LEVELS)·EXP_REWARDS 는 서버와 동일하지만 여기서는 "표시용"으로만 쓴다.
// =============================================================================

export type ScoreOutcome = {
    changed: boolean;
    scored: boolean;
    amount: number;
    sign: number;
    levelUp: boolean;
    newLv: { level: number; name: string } | null;
    prevLv: { level: number; name: string } | null;
    newExp: number;
};

function normalizeScore(data: unknown): ScoreOutcome {
    const d = (data ?? {}) as Record<string, unknown>;
    const newLevel = typeof d.newLevel === "number" ? d.newLevel : null;
    const prevLevel = typeof d.prevLevel === "number" ? d.prevLevel : null;
    return {
        changed: !!d.changed,
        scored: !!d.scored,
        amount: typeof d.amount === "number" ? d.amount : 0,
        sign: typeof d.sign === "number" ? d.sign : 0,
        levelUp: !!d.levelUp,
        newLv: newLevel
            ? {
                  level: newLevel,
                  name:
                      (d.levelName as string) ||
                      LEVELS[newLevel - 1]?.name ||
                      "",
              }
            : null,
        prevLv: prevLevel
            ? { level: prevLevel, name: LEVELS[prevLevel - 1]?.name || "" }
            : null,
        newExp: typeof d.newExp === "number" ? d.newExp : 0,
    };
}

/**
 * 업무 상태 변경 + (완료 진입/이탈 시) 점수 — 서버에서 원자적으로 처리.
 * 권한이 없으면(본인 업무·관리자 아님) RPC 가 에러를 던지므로 throw 된다.
 */
export async function rpcSetTaskStatus(
    taskId: number,
    status: string,
    member: string,
): Promise<ScoreOutcome> {
    const { data, error } = await supabase.rpc("set_task_status", {
        p_task_id: taskId,
        p_status: status,
    });
    if (error) throw error;
    const out = normalizeScore(data);
    if (out.levelUp && out.newLv) {
        sendLevelUpMessage(member, out.newLv.name).catch(console.error);
    }
    return out;
}

/**
 * 퀘스트 완료 토글(done=true 완료 / false 대기) + 점수.
 * 권한 없으면 throw.
 */
export async function rpcSetQuestDone(
    questId: number,
    done: boolean,
    member: string,
): Promise<ScoreOutcome> {
    const { data, error } = await supabase.rpc("set_quest_done", {
        p_quest_id: questId,
        p_done: done,
    });
    if (error) throw error;
    const out = normalizeScore(data);
    if (out.levelUp && out.newLv) {
        sendLevelUpMessage(member, out.newLv.name).catch(console.error);
    }
    return out;
}

export type AttendanceOutcome = {
    success: boolean;
    message?: string;
    streak: number;
    exp: number;
    levelUp: boolean;
    newLv: { level: number; name: string } | null;
};

/**
 * 출석 체크(본인) — 서버가 jwt 이메일로 본인 식별 후 연속·점수 처리.
 * member 인자는 레벨업 구글챗 알림 문구에만 사용.
 */
export async function rpcAttendanceCheck(
    member: string,
): Promise<AttendanceOutcome> {
    const { data, error } = await supabase.rpc("attendance_check");
    if (error) {
        return {
            success: false,
            message: "출석 처리 중 오류가 발생했어요.",
            streak: 0,
            exp: 0,
            levelUp: false,
            newLv: null,
        };
    }
    const d = (data ?? {}) as Record<string, unknown>;
    if (!d.success) {
        return {
            success: false,
            message: (d.message as string) || "오류",
            streak: 0,
            exp: 0,
            levelUp: false,
            newLv: null,
        };
    }
    const newLevel = typeof d.newLevel === "number" ? d.newLevel : null;
    const out: AttendanceOutcome = {
        success: true,
        streak: typeof d.streak === "number" ? d.streak : 0,
        exp: typeof d.exp === "number" ? d.exp : 0,
        levelUp: !!d.levelUp,
        newLv: newLevel
            ? {
                  level: newLevel,
                  name:
                      (d.levelName as string) ||
                      LEVELS[newLevel - 1]?.name ||
                      "",
              }
            : null,
    };
    if (out.levelUp && out.newLv) {
        sendLevelUpMessage(member, out.newLv.name).catch(console.error);
    }
    return out;
}
