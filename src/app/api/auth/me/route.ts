import { NextResponse } from "next/server";
import { getServerUser } from "@/infrastructure/supabase/server";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";

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

    const normalized = await loadNormalizedIdentity(supabase, user.email);
    if (normalized?.profile) {
        return NextResponse.json({
            email: normalized.profile.email,
            name: normalized.profile.displayName,
            status: normalized.profile.accountStatus,
        });
    }

    // 프로필이 없는 사용자 (가입 직후 트리거 지연 등)
    return NextResponse.json({
        email: user.email,
        name: user.email.split("@")[0],
        status: "pending",
    });
}
