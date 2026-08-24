import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { LEADER } from "@/lib/constants";
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
    if (normalized?.profile) {
        const membership = normalized.memberships.find(
            (item) => item.teamId === teamId,
        );
        const active =
            normalized.profile.accountStatus === "active" &&
            membership?.status === "active";
        return {
            supabase,
            user,
            role: !active
                ? null
                : membership.role === "admin" ||
                    normalized.profile.displayName === LEADER
                  ? "admin"
                  : "member",
        };
    }

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
                : data?.role === "admin" || data?.name === LEADER
                ? "admin"
                : "member",
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
