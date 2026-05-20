import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";

export async function POST() {
    const store = await cookies();
    const accessToken = store.get(ACCESS_COOKIE)?.value;

    if (accessToken) {
        try {
            await apiFetch("/api/auth/logout", {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` },
            });
        } catch (err) {
            // Spring 호출이 실패해도 클라이언트 세션은 종료해야 하므로 무시
            console.error("[logout] spring call failed:", err);
        }
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
    res.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
}
