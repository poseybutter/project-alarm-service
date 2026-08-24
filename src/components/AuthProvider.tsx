"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getMemberName } from "@/lib/auth";
import { LEADER, TEAM_ID } from "@/lib/constants";

type AuthContextType = {
    user: User | null;
    member: string | null;
    avatarUrl: string | null;
    loading: boolean;
    role: "admin" | "member" | "guest";
    refreshAvatar: () => void;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    member: null,
    avatarUrl: null,
    loading: true,
    role: "member",
    refreshAvatar: () => {},
});

/** 리프레시 토큰 무효 등 → 로컬 스토리지만 비우고 다시 로그인 유도 */
async function clearInvalidLocalSession() {
    try {
        await supabase.auth.signOut({ scope: "local" });
    } catch {
        /* ignore */
    }
    try {
        await fetch("/api/auth/clear-session", { method: "POST" });
    } catch {
        /* ignore */
    }
}

function looksLikeInvalidRefreshOrJwt(message: string | undefined) {
    if (!message) return false;
    const m = message.toLowerCase();
    return (
        m.includes("refresh token") ||
        m.includes("invalid jwt") ||
        m.includes("jwt expired") ||
        m.includes("session missing")
    );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [role, setRole] = useState<"admin" | "member" | "guest">("member");

    useEffect(() => {
        let cancelled = false;

        async function boot() {
            try {
                const {
                    data: { session },
                    error,
                } = await supabase.auth.getSession();
                if (cancelled) return;
                if (error) {
                    console.warn("세션 조회 실패:", error.message);
                    if (looksLikeInvalidRefreshOrJwt(error.message)) {
                        await clearInvalidLocalSession();
                    }
                    setUser(null);
                    return;
                }
                setUser(session?.user ?? null);
            } catch (e) {
                if (cancelled) return;
                console.warn(
                    "세션 조회 중 오류:",
                    e instanceof Error ? e.message : e,
                );
                await clearInvalidLocalSession();
                setUser(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void boot();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (
                event === "SIGNED_OUT" ||
                (event as string) === "USER_DELETED"
            ) {
                setUser(null);
                setLoading(false);
                return;
            }

            if (!session) {
                setUser(null);
                setLoading(false);
                return;
            }

            if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
                setUser(session.user);
            }
            setLoading(false);
        });

        return () => {
            cancelled = true;
            subscription.unsubscribe();
        };
    }, []);

    const member = getMemberName(user?.email || "");

    async function loadAvatar(memberName: string) {
        if (memberName === "GUEST") {
            setAvatarUrl(null);
            setRole("guest");
            return;
        }
        const { data } = await supabase
            .from("players")
            .select("avatar_url, role, status")
            .eq("team_id", TEAM_ID)
            .eq("name", memberName)
            .maybeSingle();
        setAvatarUrl(data?.avatar_url || null);
        if (data?.status !== "active") {
            setRole("guest");
            return;
        }
        setRole(
            data?.role === "admin" || memberName === LEADER
                ? "admin"
                : "member",
        );
    }

    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (member) loadAvatar(member);
            else {
                setAvatarUrl(null);
                setRole("member");
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [member]);

    function refreshAvatar() {
        if (member) loadAvatar(member);
    }

    return (
        <AuthContext.Provider
            value={{ user, member, avatarUrl, loading, role, refreshAvatar }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
