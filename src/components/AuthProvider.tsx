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
import { useQueryClient } from "@tanstack/react-query";
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
    /** 쓰기 가능 여부 — admin/member 이고 게스트가 아닐 때만 true (viewer 는 읽기 전용) */
    canWrite: boolean;
    /** team-context 가 403 — 승인 대기 중이거나 활성 팀 소속이 없는 사용자 */
    accessDenied: boolean;
    /** 로딩 표시 없이 팀 컨텍스트를 다시 불러온다 (승인 직후 등) */
    reloadTeamContext: () => Promise<void>;
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
    canWrite: false,
    accessDenied: false,
    reloadTeamContext: async () => {},
});

/** 다른 탭에 팀 전환을 알리는 채널/스토리지 키 */
const TEAM_SWITCH_CHANNEL = "team-context";
const TEAM_SWITCH_STORAGE_KEY = "team-context:switched";

/** 쓰기 권한 판정 — 화면 전역에서 같은 기준을 쓰도록 한 곳에 둔다 */
export function canWriteFor(
    role: AuthContextType["role"],
    member: string | null,
) {
    return (
        Boolean(member) &&
        member !== "GUEST" &&
        (role === "admin" || role === "member")
    );
}

/** 팀 전환을 다른 탭에 알린다 (BroadcastChannel 미지원 브라우저는 storage 이벤트) */
function notifyTeamSwitched(teamId: string) {
    try {
        if (typeof BroadcastChannel !== "undefined") {
            const channel = new BroadcastChannel(TEAM_SWITCH_CHANNEL);
            channel.postMessage({ teamId });
            channel.close();
            return;
        }
        localStorage.setItem(
            TEAM_SWITCH_STORAGE_KEY,
            JSON.stringify({ teamId, at: Date.now() }),
        );
    } catch {
        /* ignore */
    }
}

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
    const queryClient = useQueryClient();
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
    const [accessDenied, setAccessDenied] = useState(false);
    // 팀 컨텍스트 요청 순번 — 늦게 도착한 이전 응답이 최신 상태를 덮어쓰지 않도록 한다
    const teamContextSeqRef = useRef(0);

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

    const clearTeamContext = useCallback(() => {
        setResolvedMember(null);
        setAvatarUrl(null);
        setRole("guest");
        setTeamId(null);
        setPlayerId(null);
        setTeams([]);
        setMembers([]);
        setMemberOptions([]);
        setModules(new Set(ALL_MODULES));
    }, []);

    /**
     * 팀 컨텍스트 조회.
     * background=true 이면 loading 을 올리지 않는다 — AuthGuard/ModuleGuard 가
     * 자식을 언마운트했다가 다시 마운트하는 깜빡임(입력 중 폼 초기화 등)을 막는다.
     * 백그라운드 갱신 실패는 기존 컨텍스트를 유지한다.
     */
    const loadTeamContext = useCallback(
        async ({ background = false }: { background?: boolean } = {}) => {
            const seq = ++teamContextSeqRef.current;
            if (!background) setTeamContextLoading(true);
            try {
                const response = await fetch("/api/team-context", {
                    cache: "no-store",
                });
                if (seq !== teamContextSeqRef.current) return;
                if (!response.ok) {
                    if (background) return;
                    clearTeamContext();
                    // 403: 승인 대기·활성 팀 없음 → 로그인 대신 /pending 으로 안내
                    setAccessDenied(response.status === 403);
                    return;
                }
                const context = (await response.json()) as TeamContextResponse;
                if (seq !== teamContextSeqRef.current) return;
                setAccessDenied(false);
                applyTeamContext(context);
            } catch (error) {
                if (seq !== teamContextSeqRef.current) return;
                console.error("[auth] Failed to load team context", error);
                if (background) return;
                clearTeamContext();
                setAccessDenied(false);
            } finally {
                // 최신 요청만 로딩을 내린다 (이전 요청이 먼저 끝나도 무시)
                if (seq === teamContextSeqRef.current) {
                    setTeamContextLoading(false);
                }
            }
        },
        [applyTeamContext, clearTeamContext],
    );

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

        // 사용자가 바뀌면 이전 사용자의 팀 컨텍스트를 즉시 초기화한다.
        // loadTeamContext 가 완료되기 전까지 이전 사용자 데이터가 노출되지 않도록 한다.
        // 서버 상태 캐시도 함께 비운다 — queryKey 에는 사용자 식별자가 없어
        // 같은 팀의 다음 사용자에게 이전 사용자 조회 결과가 보일 수 있다.
        queryClient.clear();
        // 이전 사용자에 대한 진행 중 응답은 무시되도록 순번을 올린다
        teamContextSeqRef.current += 1;
        setAccessDenied(false);
        setResolvedMember(null);
        setAvatarUrl(null);
        setTeamId(null);
        setPlayerId(null);
        setTeams([]);
        setMembers([]);
        setMemberOptions([]);
        setModules(new Set(ALL_MODULES));

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
    }, [loadTeamContext, loading, user, queryClient]);

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
            // 팀 쿠키는 브라우저 전체에 공유되므로 다른 탭도 새 팀으로 다시 불러오게 알린다
            notifyTeamSwitched(nextTeamId);
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
        if (user) void loadTeamContext({ background: true });
    }, [loadTeamContext, user]);

    const reloadTeamContext = useCallback(async () => {
        if (user) await loadTeamContext({ background: true });
    }, [loadTeamContext, user]);

    // 다른 탭에서 팀을 전환하면 이 탭도 새로 고친다 (화면은 이전 팀, 쿠키는 새 팀인 불일치 방지)
    useEffect(() => {
        if (!teamId) return;
        function handleSwitched(nextTeamId: unknown) {
            if (typeof nextTeamId === "string" && nextTeamId !== teamId) {
                window.location.reload();
            }
        }
        if (typeof BroadcastChannel !== "undefined") {
            const channel = new BroadcastChannel(TEAM_SWITCH_CHANNEL);
            channel.onmessage = (event: MessageEvent) =>
                handleSwitched(
                    (event.data as { teamId?: unknown } | null)?.teamId,
                );
            return () => channel.close();
        }
        function handleStorage(event: StorageEvent) {
            if (event.key !== TEAM_SWITCH_STORAGE_KEY || !event.newValue) return;
            try {
                handleSwitched(
                    (JSON.parse(event.newValue) as { teamId?: unknown }).teamId,
                );
            } catch {
                /* ignore */
            }
        }
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [teamId]);

    const canWrite = canWriteFor(role, member);

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
            canWrite,
            accessDenied,
            reloadTeamContext,
        }),
        [
            accessDenied,
            canWrite,
            reloadTeamContext,
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
