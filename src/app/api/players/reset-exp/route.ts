/**
 * GET /api/players/reset-exp?type=monthly  → month_exp 전체 초기화 (매월 1일 00:01 KST)
 * GET /api/players/reset-exp?type=weekly   → week_exp  전체 초기화 (매주 월요일 00:01 KST)
 *
 * 인증: Authorization: Bearer $CRON_SECRET
 */

import { NextResponse, type NextRequest } from "next/server";
import {
    consumeSharedRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/shared/server/rateLimit";
import { isCronAuthorized } from "@/shared/server/cronAuth";
import { createServiceSupabaseClient } from "@/infrastructure/supabase/server";


/** KST 기준 현재 날짜 (YYYY-MM-DD) */
function kstDateStr() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

export async function GET(req: NextRequest) {
    if (!isCronAuthorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 시크릿 유출 시에도 파괴적 작업의 반복 실행을 막는 2차 방어선
    const rate = await consumeSharedRateLimit(
        requestRateLimitKey(req, "cron-reset-exp"),
        { limit: 5, windowMs: 5 * 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    const type = req.nextUrl.searchParams.get("type");
    if (type !== "monthly" && type !== "weekly") {
        return NextResponse.json(
            { error: "type 파라미터가 필요해요 (monthly | weekly)" },
            { status: 400 },
        );
    }

    // KST 기준 날짜 검증
    const kst = kstDateStr();
    const kstDay = Number(kst.slice(8, 10));
    // getDay() 대신 getUTCDay() — 런타임 타임존 의존 방지
    const kstDow = new Date(kst).getUTCDay(); // 0=일

    if (type === "monthly" && kstDay !== 1) {
        return NextResponse.json(
            { error: `KST 기준 오늘은 ${kst}(${kstDay}일)로 월 초기화 대상이 아닙니다` },
            { status: 400 },
        );
    }
    if (type === "weekly" && kstDow !== 1) {
        return NextResponse.json(
            { error: `KST 기준 오늘은 ${kst}(요일:${kstDow})로 주간 초기화 대상이 아닙니다` },
            { status: 400 },
        );
    }

    const supabase = createServiceSupabaseClient();
    const field = type === "monthly" ? "month_exp" : "week_exp";

    const { error, data } = await supabase
        .from("players")
        .update({ [field]: 0 })
        .neq("id", 0) // 전체 행 대상 (RLS 우회용 dummy 조건)
        .select("id");
    const count = data?.length ?? 0;

    if (error) {
        console.error(`[reset-exp] ${type} 실패`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[reset-exp] ${type} 완료 — ${count ?? "?"}명 초기화`);
    return NextResponse.json({ message: `${type} EXP 초기화 완료`, count });
}
