/**
 * POST /api/seasons/close
 *
 * 활성 시즌 종료 및 명예의 전당 기록 저장.
 * 순위·특별상 계산: 여기서 처리
 * 저장(기록·시즌 종료·다음 시즌·EXP 리셋): close_season RPC, 단일 트랜잭션
 *
 * 인증: Authorization: Bearer $CRON_SECRET
 * 수동 강제 종료: ?force=true (CRON_SECRET 필수)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/infrastructure/supabase/server";
import { calcLevel } from "@/features/gamification/maple";
import { getTeamRoster } from "@/features/gamification/api/getTeamRoster";
import { AWARD_TITLE_TO_ID } from "@/features/gamification/titles";

function isAuthorized(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret && process.env.NODE_ENV !== "production") return true;
    if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
    return false;
}

/** 오늘 날짜 (KST 기준 YYYY-MM-DD) */
function todayKst() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

/** 시즌 종료일로부터 다음 시즌 정보를 계산한다. */
function nextSeasonInfo(rangeEnd: string): {
    label: string;
    range_start: string;
    range_end: string;
} {
    const [y, m, d] = rangeEnd.split("-").map(Number);

    // Aug 31 종료 → 같은 해 Sep 1 ~ Dec 31
    if (m === 8 && d === 31) {
        return {
            label: `${y} 시즌`,
            range_start: `${y}-09-01`,
            range_end: `${y}-12-31`,
        };
    }

    // Dec 31 종료 → 다음 해 Jan 1 ~ Dec 31
    const nextYear = m === 12 && d === 31 ? y + 1 : y;
    const nextStart = new Date(y, m - 1, d + 1);
    const ns = nextStart.toISOString().slice(0, 10);
    return {
        label: `${nextYear} 시즌`,
        range_start: ns,
        range_end: `${nextYear}-12-31`,
    };
}

/** Vercel Cron은 GET 요청을 보내므로 GET도 동일 로직으로 처리한다. */
export async function GET(req: NextRequest) {
    return POST(req);
}

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const force = req.nextUrl.searchParams.get("force") === "true";
    const supabase = createServiceSupabaseClient();
    const today = todayKst();
    const results: string[] = [];

    // 1. 종료 대상 시즌 조회 (force=true면 active인 시즌 전부, 아니면 range_end <= today)
    const query = supabase
        .from("seasons")
        .select("*")
        .eq("status", "active");

    if (!force) {
        query.lte("range_end", today);
    }

    const { data: activeSeasons, error: seasonErr } = await query;
    if (seasonErr) {
        return NextResponse.json({ error: seasonErr.message }, { status: 500 });
    }
    if (!activeSeasons?.length) {
        return NextResponse.json({ message: "종료할 시즌이 없어요", results: [] });
    }

    for (const season of activeSeasons) {
        const teamId: string = season.team_id;
        const seasonId: number = season.id;

        try {
            // 2. 팀원 EXP 순위 계산
            let players;
            try {
                players = await getTeamRoster(supabase, teamId);
            } catch (err) {
                throw new Error(
                    `players 조회 실패: ${err instanceof Error ? err.message : String(err)}`,
                );
            }

            const records = players.map((p, i) => {
                const lv = calcLevel(p.exp);
                return {
                    player_id: p.id,
                    member: p.name,
                    rank: i + 1,
                    exp: p.exp,
                    level: lv.level,
                    level_name: lv.name,
                };
            });

            // player_id 로 특별상 수상자를 다시 찾기 위한 맵
            const playerIdByName = new Map(
                players.map((p) => [p.name, p.id] as const),
            );

            // 3. 특별상 계산
            const { data: tasks, error: tasksErr } = await supabase
                .from("tasks")
                .select("member, priority, end_date, status")
                .eq("team_id", teamId)
                .eq("status", "완료")
                .gte("end_date", season.range_start)
                .lte("end_date", season.range_end);
            if (tasksErr) throw new Error(`tasks 조회 실패: ${tasksErr.message}`);

            const awards: {
                player_id: number | null;
                icon: string;
                title: string;
                member: string;
                metric: string;
            }[] = [];

            if (tasks?.length) {
                // 업무 완료왕 — 완료 건수 최다
                const doneCount: Record<string, number> = {};
                for (const t of tasks) doneCount[t.member] = (doneCount[t.member] ?? 0) + 1;
                const doneTop = Object.entries(doneCount).sort((a, b) => b[1] - a[1])[0];
                if (doneTop) {
                    awards.push({
                        player_id: playerIdByName.get(doneTop[0]) ?? null,
                        icon: "🏆",
                        title: "업무 완료왕",
                        member: doneTop[0],
                        metric: `${doneTop[1]}건`,
                    });
                }

                // 긴급 해결사 — 긴급 우선순위 완료 최다
                const urgentCount: Record<string, number> = {};
                for (const t of tasks.filter((t) => t.priority === "긴급")) {
                    urgentCount[t.member] = (urgentCount[t.member] ?? 0) + 1;
                }
                const urgentTop = Object.entries(urgentCount).sort((a, b) => b[1] - a[1])[0];
                if (urgentTop) {
                    awards.push({
                        player_id: playerIdByName.get(urgentTop[0]) ?? null,
                        icon: "⚡",
                        title: "긴급 해결사",
                        member: urgentTop[0],
                        metric: `${urgentTop[1]}건`,
                    });
                }

                // 꾸준왕 — 완료 task가 있는 고유 날짜 수 최다
                const activeDays: Record<string, Set<string>> = {};
                for (const t of tasks) {
                    if (!t.end_date) continue;
                    if (!activeDays[t.member]) activeDays[t.member] = new Set();
                    activeDays[t.member].add(t.end_date);
                }
                const daysTop = Object.entries(activeDays)
                    .map(([m, days]) => [m, days.size] as [string, number])
                    .sort((a, b) => b[1] - a[1])[0];
                if (daysTop) {
                    awards.push({
                        player_id: playerIdByName.get(daysTop[0]) ?? null,
                        icon: "📅",
                        title: "꾸준왕",
                        member: daysTop[0],
                        metric: `${daysTop[1]}일`,
                    });
                }
            }

            // 4. 다음 시즌 정보 계산 (실제 생성 여부는 DB 함수가 팀별 active 시즌
            //    유무를 다시 확인해서 결정한다 — 동시 요청 시 중복 방지)
            const next = nextSeasonInfo(season.range_end);
            const mvp = players[0]?.name ?? null;

            // 5. 기록·특별상 저장, 시즌 종료, 다음 시즌 생성, EXP·레벨 초기화를
            //    하나의 트랜잭션으로 처리한다.
            const { data: closeResult, error: closeErr } = await supabase.rpc(
                "close_season",
                {
                    p_season_id: seasonId,
                    p_records: records,
                    p_awards: awards,
                    p_mvp_member: mvp,
                    p_next_label: next.label,
                    p_next_sub_label: null,
                    p_next_range_start: next.range_start,
                    p_next_range_end: next.range_end,
                },
            );
            if (closeErr) throw new Error(`close_season: ${closeErr.message}`);

            if (closeResult?.skipped) {
                results.push(
                    `⏭️ ${season.label} (team: ${teamId}) 건너뜀: ${closeResult.reason}`,
                );
                continue;
            }

            // 시즌 수상 칭호 → players.icons 에 누적 기록
            const iconWinners: { player_id: number; title_id: string }[] = [];

            // MVP (EXP 1위)
            const mvpId = players[0]?.id;
            if (mvpId != null) {
                iconWinners.push({ player_id: mvpId, title_id: "season_mvp" });
            }

            // 특별상
            for (const award of awards) {
                const titleId = award.player_id != null ? AWARD_TITLE_TO_ID[award.title] : null;
                if (titleId && award.player_id != null) {
                    iconWinners.push({ player_id: award.player_id, title_id: titleId });
                }
            }

            // 개별 플레이어 icons 컬럼에 append (read → write)
            for (const { player_id, title_id } of iconWinners) {
                const { data: row } = await supabase
                    .from("players")
                    .select("icons")
                    .eq("id", player_id)
                    .eq("team_id", teamId)
                    .single();
                const current: string[] = Array.isArray(row?.icons) ? row.icons : [];
                await supabase
                    .from("players")
                    .update({ icons: [...current, title_id] })
                    .eq("id", player_id)
                    .eq("team_id", teamId);
            }

            results.push(`✅ ${season.label} (team: ${teamId}) 종료 완료`);
        } catch (err) {
            results.push(
                `❌ ${season.label} (team: ${teamId}) 실패: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    return NextResponse.json({ message: "완료", results });
}
