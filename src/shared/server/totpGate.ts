import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateVerifyToken } from "@/shared/server/pinToken";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";

/** 클라이언트가 TOTP verify 토큰을 실어 보내는 요청 헤더 (useProjectFields 와 동일) */
export const TOTP_TOKEN_HEADER = "x-totp-token";

/**
 * 팀이 TOTP 를 요구(teams.totp_required)하면 요청의 verify 토큰을 서버에서 검증한다.
 * 클라이언트 화면 잠금만으로는 API 직접 호출을 막을 수 없으므로 조회 API 에서도 확인한다.
 *
 * - 통과: null
 * - 토큰 없음/만료/위조: 403
 * - TOTP 설정 조회 실패: 503 (fail-closed — 확인할 수 없으면 열지 않는다)
 */
export async function enforceTeamTotp(
    svc: SupabaseClient,
    req: Request,
    teamId: string,
    userEmail: string,
): Promise<NextResponse | null> {
    const { data: team, error } = await svc
        .from("teams")
        .select("totp_required")
        .eq("id", teamId)
        .maybeSingle();
    if (error) {
        console.error("[totp-gate] totp_required 조회 실패", error);
        return NextResponse.json(
            { message: "TOTP 설정을 확인하지 못했습니다." },
            { status: 503 },
        );
    }
    if (!team?.totp_required) return null;

    const token = req.headers.get(TOTP_TOKEN_HEADER)?.trim() || "";
    const identity = token ? await loadNormalizedIdentity(svc, userEmail) : null;
    const profileId = identity?.profile?.id;
    let valid = false;
    if (profileId) {
        try {
            valid = await validateVerifyToken(svc, teamId, token, profileId);
        } catch (secretError) {
            console.error("[totp-gate] TOTP 시크릿 조회 실패", secretError);
            return NextResponse.json(
                { message: "TOTP 설정을 확인하지 못했습니다." },
                { status: 503 },
            );
        }
    }
    if (!valid) {
        return NextResponse.json(
            { message: "TOTP verification required", totpRequired: true },
            { status: 403 },
        );
    }
    return null;
}