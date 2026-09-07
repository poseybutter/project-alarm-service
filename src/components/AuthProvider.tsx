"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/infrastructure/supabase/client";
import type {
    ModuleKey,
    TeamMemberOption,
    TeamContextOption,
    TeamContextResponse,
} from "@/features/team-context/types";
import { ALL_MODULES } from "@/features/team-context/types";

type AuthContextType = {
    user: User | null;
    member: string | null;
    avatarUrl: string | null;
    loading: boolean;
    role: "admin" | "member" | "viewer" | "guest";
    teamId: string | null;
    playerId: number | null;
    teams: TeamContextOption[];
    members: string[];
    memberOptions: TeamMemberOption[];
    modules: Set<ModuleKey>;
    switchingTeam: boolean;
    teamSwitchError: string | null;
    switchTeam: (teamId: string) => Promise<void>;
    refreshAvatar: () => void;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    member: null,
    avatarUrl: null,
    loading: true,
    role: "member",
    teamId: null,
    playerId: null,
    teams: [],
    members: [],
    memberOptions: [],
    modules: new Set(ALL_MODULES),
    switchingTeam: false,
    teamSwitchError: null,
    switchTeam: async () => {},
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
    const [teamContextLoading, setTeamContextLoading] = useState(true);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [role, setRole] = useState<"admin" | "member" | "viewer" | "guest">("member");
    const [resolvedMember, setResolvedMember] = useState<string | null>(null);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [playerId, setPlayerId] = useState<number | null>(null);
    const [teams, setTeams] = useState<TeamContextOption[]>([]);
    const [members, setMembers] = useState<string[]>([]);
    const [memberOptions, setMemberOptions] = useState<TeamMemberOption[]>([]);
    const [modules, setModules] = useState<Set<ModuleKey>>(new Set(ALL_MODULES));
    const [switchingTeam, setSwitchingTeam] = useState(false);
    const [teamSwitchError, setTeamSwitchError] = useState<string | null>(null);

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

    const member = user ? resolvedMember : null;

    const applyTeamContext = useCallback((context: TeamContextResponse) => {
        setResolvedMember(context.member);
        setAvatarUrl(context.avatarUrl);
        setRole(context.role);
        setTeamId(context.teamId);
        setPlayerId(context.playerId);
        setTeams(context.teams);
        setMembers(context.members);
        setMemberOptions(context.memberOptions);
        setModules(new Set(context.modules));
    }, []);

    const loadTeamContext = useCallback(async () => {
        setTeamContextLoading(true);
        try {
            const response = await fetch("/api/team-context", {
                cache: "no-store",
            });
            if (!response.ok) {
                setResolvedMember(null);
                setAvatarUrl(null);
                setRole("guest");
                setTeamId(null);
                setPlayerId(null);
                setTeams([]);
                setMembers([]);
                setMemberOptions([]);
                setModules(new Set(ALL_MODULES));
                return;
            }
            applyTeamContext((await response.json()) as TeamContextResponse);
        } catch (error) {
            console.error("[auth] Failed to load team context", error);
            setResolvedMember(null);
            setAvatarUrl(null);
            setRole("guest");
            setTeamId(null);
            setPlayerId(null);
            setTeams([]);
            setMembers([]);
            setMemberOptions([]);
            setModules(new Set(ALL_MODULES));
        } finally {
            setTeamContextLoading(false);
        }
    }, [applyTeamContext]);

    // 같은 사용자의 토큰 갱신(TOKEN_REFRESHED)으로 인한 불필요한
    // 팀 컨텍스트 재로드를 방지한다. Supabase는 토큰 갱신 시 session.user를
    // 새 객체로 반환하기 때문에, user.id 기준으로 실제 사용자 변경만 감지한다.
    const prevUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        // 세션 부팅(boot)이 끝나기 전에는 판단하지 않는다.
        // 부팅 전 user는 항상 null이라, 여기서 teamContextLoading을 false로 내리면
        // boot 직후 "authLoading=false && member=null" 창이 열려
        // 로그인 상태인데도 페이지가 /login으로 리다이렉트된다.
        if (loading) return;

        const currentUserId = user?.id ?? null;
        if (currentUserId === prevUserIdRef.current) return;
        prevUserIdRef.current = currentUserId;

        const timer = window.setTimeout(() => {
            if (user) void loadTeamContext();
            else {
                setTeamContextLoading(false);
                setResolvedMember(null);
                setAvatarUrl(null);
                setRole("member");
                setTeamId(null);
                setPlayerId(null);
                setTeams([]);
                setMembers([]);
                setMemberOptions([]);
                setModules(new Set(ALL_MODULES));
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [loadTeamContext, loading, user]);

    const switchTeam = useCallback(async (nextTeamId: string) => {
        if (!nextTeamId || nextTeamId === teamId || switchingTeam) return;
        setSwitchingTeam(true);
        setTeamSwitchError(null);
        try {
            const response = await fetch("/api/team-context", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ teamId: nextTeamId }),
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as
                    | { message?: string }
                    | null;
                throw new Error(body?.message || "팀 전환에 실패했습니다.");
            }
            applyTeamContext((await response.json()) as TeamContextResponse);
            window.location.reload();
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "팀 전환에 실패했습니다.";
            setTeamSwitchError(message);
            throw error;
        } finally {
            setSwitchingTeam(false);
        }
    }, [applyTeamContext, switchingTeam, teamId]);

    const refreshAvatar = useCallback(() => {
        if (user) void loadTeamContext();
    }, [loadTeamContext, user]);

    const contextValue = useMemo<AuthContextType>(
        () => ({
            user,
            member,
            avatarUrl,
            loading: loading || (Boolean(user) && teamContextLoading),
            role,
            teamId,
            playerId,
            teams,
            members,
            memberOptions,
            modules,
            switchingTeam,
            teamSwitchError,
            switchTeam,
            refreshAvatar,
        }),
        [
            avatarUrl,
            loading,
            member,
            memberOptions,
            members,
            modules,
            playerId,
            refreshAvatar,
            role,
            switchTeam,
            switchingTeam,
            teamContextLoading,
            teamId,
            teams,
            teamSwitchError,
            user,
        ],
    );

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
