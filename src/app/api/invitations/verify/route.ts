import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

/**
 * 초대코드 검증.
 * - 형식: 8자, 영문 대문자/숫자 (입력단의 하이픈/공백/소문자 모두 정규화)
 * - DB: used=false, expires_at > now()
 * - 성공 시 5분 유효 ud2_invite 쿠키 발급 (HttpOnly) — /guild-join 진입 토큰
 *
 * 보안: 만료/없음/사용됨은 모두 같은 메시지 반환 (정보 누설 방어).
 * Rate limit: 같은 IP 가 10분 윈도우 안에서 5회 실패하면 10분 차단 (429).
 *   - 실패마다 invite_attempts INSERT
 *   - 성공 시 해당 IP 의 attempts DELETE 로 카운터 리셋
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

function getClientIp(req: NextRequest): string | null {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) {
        const first = fwd.split(",")[0]?.trim();
        if (first) return first;
    }
    return req.headers.get("x-real-ip") || null;
}

function invalidJson() {
    return NextResponse.json(
        { valid: false, message: "유효하지 않은 초대코드입니다." },
        { status: 400 },
    );
}

export async function POST(req: NextRequest) {
    let payload: { code?: unknown };
    try {
        payload = await req.json();
    } catch {
        return invalidJson();
    }

    const raw = typeof payload.code === "string" ? payload.code : "";
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const ip = getClientIp(req);
    const supabase = await getSupabaseServer();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const windowStartIso = new Date(nowMs - WINDOW_MS).toISOString();

    // 1) IP 차단 체크 — 형식 검증보다 먼저 (실패 카운트 누적 방지가 아니라
    //    차단 윈도우 안에서는 어떤 시도도 카운트만 차지하지 못하게)
    if (ip) {
        const { count } = await supabase
            .from("invite_attempts")
            .select("id", { count: "exact", head: true })
            .eq("ip", ip)
            .gt("attempted_at", windowStartIso);
        if ((count ?? 0) >= MAX_ATTEMPTS) {
            return NextResponse.json(
                {
                    valid: false,
                    message:
                        "⛔ 너무 많이 시도했어요. 10분 후 다시 시도해주세요.",
                },
                { status: 429 },
            );
        }
    }

    // 실패로 판정될 때 호출하는 헬퍼 — IP 가 있으면 attempts INSERT
    const recordFailure = async () => {
        if (ip) {
            const { error: insertErr } = await supabase
                .from("invite_attempts")
                .insert({ ip });
            if (insertErr) {
                console.error(
                    "[invitations/verify] invite_attempts insert failed:",
                    insertErr,
                );
            }
        }
    };

    // 2) 형식 검증
    if (code.length !== 8) {
        await recordFailure();
        return invalidJson();
    }

    // 3) DB 조회
    const { data: invitation, error } = await supabase
        .from("invitations")
        .select("id, team_id, expires_at, used")
        .eq("code", code)
        .maybeSingle();

    if (error) {
        console.error("[invitations/verify] select failed:", error);
        await recordFailure();
        return invalidJson();
    }
    if (!invitation || invitation.used || invitation.expires_at <= nowIso) {
        await recordFailure();
        return invalidJson();
    }

    // 4) 성공 — 해당 IP 의 attempts 삭제 (카운터 리셋)
    if (ip) {
        const { error: delErr } = await supabase
            .from("invite_attempts")
            .delete()
            .eq("ip", ip);
        if (delErr) {
            console.error(
                "[invitations/verify] invite_attempts delete failed:",
                delErr,
            );
        }
    }

    const res = NextResponse.json({
        valid: true,
        teamId: invitation.team_id,
        invitationId: invitation.id,
    });
    // 5분 유효 임시 쿠키 — /guild-join 에서 검증
    const isProd = process.env.NODE_ENV === "production";
    res.cookies.set("ud2_invite", String(invitation.id), {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: 300,
        path: "/",
    });
    return res;
}
