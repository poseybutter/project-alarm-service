import { NextResponse } from "next/server";
import { getServerUser } from "@/infrastructure/supabase/server";
import {
    isIdentitySchemaUnavailable,
    loadNormalizedIdentity,
} from "@/features/identity/server/identityRepository";

/**
 * 현재 로그인된 사용자 상태 조회.
 * pending 화면에서 15초 폴링용 — 승인/거절 여부 확인.
 */
export async function GET() {
    const { supabase, user } = await getServerUser();
    if (!user?.email) {
        return NextResponse.json(
            { message: "인증되지 않았어요" },
            { status: 401 },
        );
    }

    try {
        const normalized = await loadNormalizedIdentity(supabase, user.email);
        if (normalized?.profile) {
            return NextResponse.json({
                email: normalized.profile.email,
                name: normalized.profile.displayName,
                status: normalized.profile.accountStatus,
            });
        }
    } catch (err) {
        if (!isIdentitySchemaUnavailable(err)) throw err;
    }

    // 스키마 미적용 폴백: players 직접 조회
    const { data, error } = await supabase
        .from("players")
        .select("name, status")
        .eq("email", user.email)
        .maybeSingle();
    if (error) {
        return NextResponse.json(
            { message: "사용자 정보를 확인할 수 없습니다." },
            { status: 500 },
        );
    }

    return NextResponse.json({
        email: user.email,
        name: data?.name ?? user.email.split("@")[0],
        status: data?.status ?? "pending",
    });
}
