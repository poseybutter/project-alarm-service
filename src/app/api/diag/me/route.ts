import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

/**
 * 진단용 — admin 권한이 안 잡힐 때 어디서 끊기는지 보기 위한 엔드포인트.
 * 프로덕션에서는 비활성화한다.
 */
export async function GET() {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ message: "disabled" }, { status: 404 });
    }

    // (0) raw cookies — 어떤 쿠키가 서버에 도착했는지
    const store = await cookies();
    const allCookies = store.getAll();
    const sbAuthCookies = allCookies
        .filter(
            (c) =>
                c.name.startsWith("sb-") && c.name.includes("-auth-token"),
        )
        .map((c) => ({ name: c.name, length: c.value.length }));

    const supabase = await getSupabaseServer();

    // (1) supabase 세션 사용자
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    // (2) 이메일로 players 조회 — 중복 행 가능성도 보기 위해 .single 대신 list
    const email = user?.email ?? null;
    let playersRows:
        | Array<{
              id: number;
              email: string;
              name: string;
              role: string;
              status: string;
              team_id: string | null;
          }>
        | null = null;
    let playersError: unknown = null;
    if (email) {
        const { data, error } = await supabase
            .from("players")
            .select("id, email, name, role, status, team_id")
            .eq("email", email);
        playersRows = data;
        playersError = error;
    }

    // (3) maybeSingle 동작 확인 — getCurrentPlayer 와 동일 경로
    let maybeSingleData: unknown = null;
    let maybeSingleError: unknown = null;
    if (email) {
        const { data, error } = await supabase
            .from("players")
            .select("id, name, email, status, role, team_id, bio")
            .eq("email", email)
            .maybeSingle();
        maybeSingleData = data;
        maybeSingleError = error;
    }

    return NextResponse.json(
        {
            step0_cookies: {
                cookieCount: allCookies.length,
                cookieNames: allCookies.map((c) => c.name),
                sbAuthCookies,
            },
            step1_authUser: {
                hasUser: !!user,
                email,
                user_metadata_email: user?.user_metadata?.email ?? null,
                userError: userError?.message ?? null,
            },
            step2_playersList: {
                rowCount: playersRows?.length ?? null,
                rows: playersRows,
                playersError,
            },
            step3_maybeSingle: {
                data: maybeSingleData,
                error: maybeSingleError,
            },
            verdict:
                !user
                    ? "❌ supabase 세션이 서버에서 안 읽힘 — getUser null"
                    : !email
                      ? "❌ user.email 없음"
                      : !playersRows || playersRows.length === 0
                        ? "❌ players 테이블에 해당 email 행 없음 (혹은 RLS 막힘)"
                        : playersRows.length > 1
                          ? `❌ 중복 행 ${playersRows.length}개 — maybeSingle 이 에러 반환`
                          : playersRows[0].role !== "admin"
                            ? `❌ role 이 'admin' 아님 (실제: ${JSON.stringify(playersRows[0].role)})`
                            : "✅ admin 으로 잡혀야 정상",
        },
        { status: 200 },
    );
}
