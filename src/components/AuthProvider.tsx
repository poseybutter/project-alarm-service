"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthRole = "admin" | "member" | "guest";

type AuthContextType = {
    user: User | null;
    member: string | null;
    avatarUrl: string | null;
    loading: boolean;
    role: AuthRole;
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

function normalizeRole(raw: string | null | undefined): AuthRole {
    if (raw === "admin") return "admin";
    if (raw === "guest") return "guest";
    return "member";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [member, setMember] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [role, setRole] = useState<AuthRole>("member");
    const [loading, setLoading] = useState(true);

    /**
     * 이메일 기준으로 players 행을 읽어 member/role/avatar 를 갱신한다.
     * - 행 없음 또는 status != 'active' → member=null (AuthGuard 가 진입 차단)
     * - role='guest' 는 기존 호환으로 member='GUEST'
     */
    const loadPlayer = useCallback(async (email: string | undefined) => {
        if (!email) {
            setMember(null);
            setAvatarUrl(null);
            setRole("member");
            return;
        }
        const { data } = await supabase
            .from("players")
            .select("name, role, avatar_url, status")
            .eq("email", email)
            .maybeSingle();

        if (!data || data.status !== "active") {
            setMember(null);
            setAvatarUrl(null);
            setRole(normalizeRole(data?.role));
            return;
        }

        const r = normalizeRole(data.role);
        setRole(r);
        setMember(r === "guest" ? "GUEST" : data.name);
        setAvatarUrl(data.avatar_url || null);
    }, []);

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
                const u = session?.user ?? null;
                setUser(u);
                await loadPlayer(u?.email);
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
        } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
                const u = session?.user ?? null;
                setUser(u);
                await loadPlayer(u?.email);
            }
            if (
                event === "SIGNED_OUT" ||
                (event as string) === "USER_DELETED"
            ) {
                setUser(null);
                setMember(null);
                setAvatarUrl(null);
                setRole("member");
            }
            setLoading(false);
        });

        return () => {
            cancelled = true;
            subscription.unsubscribe();
        };
    }, [loadPlayer]);

    function refreshAvatar() {
        void loadPlayer(user?.email);
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
