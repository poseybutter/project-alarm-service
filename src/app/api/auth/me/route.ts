import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiError, apiFetch } from "@/lib/api";

const ACCESS_COOKIE = "accessToken";

/**
 * 현재 로그인된 사용자 정보 조회.
 * - accessToken 쿠키 추출 → Spring GET /api/auth/me 프록시
 * - pending 화면에서 15초 폴링용
 */
export async function GET() {
    const store = await cookies();
    const accessToken = store.get(ACCESS_COOKIE)?.value;
    if (!accessToken) {
        return NextResponse.json(
            { message: "인증되지 않았어요" },
            { status: 401 },
        );
    }

    try {
        const data = await apiFetch<unknown>("/api/auth/me", {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return NextResponse.json(data);
    } catch (err) {
        if (err instanceof ApiError) {
            return NextResponse.json(
                { message: err.message },
                { status: err.status },
            );
        }
        const message =
            err instanceof Error ? err.message : "사용자 정보 조회 실패";
        return NextResponse.json({ message }, { status: 500 });
    }
}
