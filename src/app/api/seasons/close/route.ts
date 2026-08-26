/**
 * POST /api/seasons/close
 *
 * 활성 시즌을 종료하고 명예의 전당 기록을 저장한다.
 *
 * 동작 순서:
 *  1. 종료일이 오늘 이하인 active 시즌을 찾는다.
 *  2. players 테이블에서 EXP 순위 계산 → season_records 저장.
 *  3. tasks 테이블에서 특별상 계산 → season_awards 저장.
 *  4. 시즌 status='ended', mvp_member 업데이트.
 *  5. 다음 시즌 자동 생성.
 *  6. 모든 팀원 EXP 초기화.
 *
 * 인증: Authorization: Bearer $CRON_SECRET
 * 수동 강제 종료: ?force=true (CRON_SECRET 필수)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { calcLevel } from "@/lib/maple";

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
            // 2. 팀원 EXP 순위 → season_records 저장
            const { data: players } = await supabase
                .from("players")
                .select("name, exp, level")
                .eq("team_id", teamId)
                .order("exp", { ascending: false });

            if (players?.length) {
                const records = players.map((p, i) => {
                    const lv = calcLevel(p.exp);
                    return {
                        season_id: seasonId,
                        team_id: teamId,
                        member: p.name,
                        rank: i + 1,
                        exp: p.exp,
                        level: lv.level,
                        level_name: lv.name,
                    };
                });

                const { error: recErr } = await supabase
                    .from("season_records")
                    .upsert(records, { onConflict: "season_id,member" });
                if (recErr) throw new Error(`season_records: ${recErr.message}`);
            }

            // 3. 특별상 계산
            const { data: tasks } = await supabase
                .from("tasks")
                .select("member, priority, end_date, status")
                .eq("team_id", teamId)
                .eq("status", "완료")
                .gte("end_date", season.range_start)
                .lte("end_date", season.range_end);

            const awards: {
                season_id: number;
                team_id: string;
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
                        season_id: seasonId,
                        team_id: teamId,
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
                        season_id: seasonId,
                        team_id: teamId,
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
                        season_id: seasonId,
                        team_id: teamId,
                        icon: "📅",
                        title: "꾸준왕",
                        member: daysTop[0],
                        metric: `${daysTop[1]}일`,
                    });
                }
            }

            if (awards.length) {
                const { error: awErr } = await supabase
                    .from("season_awards")
                    .insert(awards);
                if (awErr) throw new Error(`season_awards: ${awErr.message}`);
            }

            // 4. 시즌 종료 처리
            const mvp = players?.[0]?.name ?? null;
            const { error: closeErr } = await supabase
                .from("seasons")
                .update({ status: "ended", mvp_member: mvp })
                .eq("id", seasonId);
            if (closeErr) throw new Error(`season close: ${closeErr.message}`);

            // 5. 다음 시즌 자동 생성 (같은 팀에 active 시즌이 없을 때만)
            const { data: existing } = await supabase
                .from("seasons")
                .select("id")
                .eq("team_id", teamId)
                .eq("status", "active")
                .limit(1);

            if (!existing?.length) {
                const next = nextSeasonInfo(season.range_end);
                const { error: nextErr } = await supabase
                    .from("seasons")
                    .insert({
                        team_id: teamId,
                        label: next.label,
                        sub_label: null,
                        range_start: next.range_start,
                        range_end: next.range_end,
                        status: "active",
                    });
                if (nextErr) throw new Error(`next season: ${nextErr.message}`);
            }

            // 6. EXP 초기화
            const { error: resetErr } = await supabase
                .from("players")
                .update({ exp: 0, month_exp: 0, week_exp: 0 })
                .eq("team_id", teamId);
            if (resetErr) throw new Error(`exp reset: ${resetErr.message}`);

            results.push(`✅ ${season.label} (team: ${teamId}) 종료 완료`);
        } catch (err) {
            results.push(
                `❌ ${season.label} (team: ${teamId}) 실패: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    return NextResponse.json({ message: "완료", results });
}
