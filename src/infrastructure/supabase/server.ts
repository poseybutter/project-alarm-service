import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";

export async function createCookieSupabaseClient() {
    const store = await cookies();

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        {
            cookies: {
                getAll() {
                    return store.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            store.set(name, value, options);
                        });
                    } catch {
                        // Server Components cannot mutate cookies. Route Handlers
                        // still persist refreshed sessions through this callback.
                    }
                },
            },
        },
    );
}

export async function getServerUser() {
    const supabase = await createCookieSupabaseClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        return { supabase, user: null };
    }

    return { supabase, user };
}

/**
 * 주어진 팀 중 status = 'active' 인 팀 ID 집합.
 * 보관(archived)된 팀은 멤버십이 남아 있어도 쓰기 권한을 주지 않는다.
 * 조회 실패 시에는 빈 집합(전부 비활성 취급)으로 fail-closed 한다.
 * status 컬럼이 없는 레거시 스키마(V29 이전)는 전부 활성으로 본다.
 */
async function loadActiveTeamIds(teamIds: string[]): Promise<Set<string>> {
    if (teamIds.length === 0) return new Set();
    try {
        const service = createServiceSupabaseClient();
        const { data, error } = await service
            .from("teams")
            .select("id, status")
            .in("id", teamIds);
        if (error?.code === "42703") return new Set(teamIds);
        if (error) {
            console.error("[supabase/server] teams status 조회 실패", error);
            return new Set();
        }
        return new Set(
            (data ?? [])
                .filter((team) => (team.status ?? "active") === "active")
                .map((team) => String(team.id)),
        );
    } catch (error) {
        console.error("[supabase/server] teams status 조회 실패", error);
        return new Set();
    }
}

export async function getServerUserRole(teamId: string) {
    const { supabase, user } = await getServerUser();
    if (!user?.email) {
        return { supabase, user, role: null };
    }

    const normalized = await loadNormalizedIdentity(supabase, user.email);
    if (normalized?.profile && normalized.memberships.length > 0) {
        const membership = normalized.memberships.find(
            (item) => item.teamId === teamId,
        );
        const activeTeamIds = membership
            ? await loadActiveTeamIds([teamId])
            : new Set<string>();
        const active =
            normalized.profile.accountStatus === "active" &&
            membership?.status === "active" &&
            activeTeamIds.has(teamId);
        return {
            supabase,
            user,
            role: !active ? null : membership.role,
        };
    }

    return { supabase, user, role: null };
}

export async function getServerCurrentTeamRole() {
    const { supabase, user } = await getServerUser();
    if (!user?.email) {
        return { supabase, user, role: null, teamId: null };
    }

    const store = await cookies();
    const cookieTeamId = store.get("current_team_id")?.value;
    const normalized = await loadNormalizedIdentity(supabase, user.email);
    if (normalized?.profile && normalized.memberships.length > 0) {
        const activeTeamIds = await loadActiveTeamIds(
            normalized.memberships.map((membership) => membership.teamId),
        );
        // 보관된 팀의 멤버십은 선택 대상에서 제외한다
        const activeMemberships = normalized.memberships.filter(
            (membership) =>
                membership.status === "active" &&
                activeTeamIds.has(membership.teamId),
        );
        const membership = cookieTeamId
            ? activeMemberships.find((item) => item.teamId === cookieTeamId)
            : activeMemberships.find((item) => item.isDefault) ??
              activeMemberships[0];
        const active =
            normalized.profile.accountStatus === "active" && Boolean(membership);
        return {
            supabase,
            user,
            teamId: membership?.teamId ?? null,
            role: !active ? null : membership?.role ?? null,
        };
    }

    return { supabase, user, role: null, teamId: null };
}

export function createServiceSupabaseClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!url || !key) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    }

    return createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}
