"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getMemberName } from "@/lib/auth";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [role, setRole] = useState<"admin" | "member" | "guest">("member");

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session }, error }) => {
            if (error) {
                console.warn("세션 조회 실패:", error.message);
                setUser(null);
                setLoading(false);
                return;
            }
            setUser(session?.user ?? null);
            setLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
                setUser(session?.user ?? null);
            }
            if (
                event === "SIGNED_OUT" ||
                (event as string) === "USER_DELETED"
            ) {
                setUser(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
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
            .select("avatar_url, role")
            .eq("name", memberName)
            .maybeSingle();
        setAvatarUrl(data?.avatar_url || null);
        setRole(data?.role === "admin" ? "admin" : "member");
    }

    useEffect(() => {
        if (member) loadAvatar(member);
        else {
            setAvatarUrl(null);
            setRole("member");
        }
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
