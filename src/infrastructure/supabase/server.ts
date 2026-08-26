import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { TEAM_ID } from "@/shared/constants";
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
        const active =
            normalized.profile.accountStatus === "active" &&
            membership?.status === "active";
        return {
            supabase,
            user,
            role: !active ? null : membership.role,
        };
    }

    // 스키마 미적용 또는 백필 지연 시 폴백
    const { data } = await supabase
        .from("players")
        .select("name, role, status")
        .eq("team_id", teamId)
        .eq("email", user.email)
        .maybeSingle();

    return {
        supabase,
        user,
        role:
            data?.status !== "active"
                ? null
                : data?.role ?? "member",
    };
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
        const activeMemberships = normalized.memberships.filter(
            (membership) => membership.status === "active",
        );
        const membership = cookieTeamId
            ? activeMemberships.find((item) => item.teamId === cookieTeamId)
            : activeMemberships.find((item) => item.isDefault) ??
              activeMemberships.find((item) => item.teamId === TEAM_ID) ??
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

    // 스키마 미적용 또는 백필 지연 시 폴백
    const teamId = cookieTeamId || TEAM_ID;
    const { data } = await supabase
        .from("players")
        .select("name, role, status")
        .eq("team_id", teamId)
        .eq("email", user.email)
        .maybeSingle();
    return {
        supabase,
        user,
        teamId,
        role:
            data?.status !== "active"
                ? null
                : data?.role ?? "member",
    };
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
