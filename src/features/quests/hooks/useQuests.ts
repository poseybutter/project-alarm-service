"use client";

import {
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { rpcSetQuestDone } from "@/features/gamification/maple";
import {
    deleteQuestById,
    fetchQuestProjects,
    fetchQuests,
    insertQuest,
    type NewQuestInput,
} from "@/features/quests/api/questsApi";

// 서버 상태 파일럿 — 로딩·세대 가드·팀 전환 리셋은 queryKey(teamId 포함)가 대체한다.

const questsKey = (teamId: string | null) => ["quests", teamId] as const;
const projectsKey = (teamId: string | null) =>
    ["quest-projects", teamId] as const;
// 홈 캐시도 퀘스트·EXP 를 담으므로 함께 무효화 (접두사 매칭 — member 키 전체)
const homeKeyPrefix = (teamId: string | null) => ["home", teamId] as const;

export function useQuestsQuery(teamId: string | null) {
    return useQuery({
        queryKey: questsKey(teamId),
        queryFn: () => fetchQuests(teamId!),
        enabled: Boolean(teamId),
    });
}

export function useQuestProjectsQuery(teamId: string | null) {
    return useQuery({
        queryKey: projectsKey(teamId),
        queryFn: () => fetchQuestProjects(teamId!),
        enabled: Boolean(teamId),
    });
}

export function useAddQuestMutation(teamId: string | null) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: NewQuestInput) => insertQuest(input),
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: questsKey(teamId) }),
                queryClient.invalidateQueries({ queryKey: homeKeyPrefix(teamId) }),
            ]),
    });
}

export function useDeleteQuestMutation(teamId: string | null) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteQuestById(id),
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: questsKey(teamId) }),
                queryClient.invalidateQueries({ queryKey: homeKeyPrefix(teamId) }),
            ]),
    });
}

/** 완료/대기 전환 — 상태 변경·점수는 서버 RPC 담당 (ADR: 점수 쓰기 RPC 단일화) */
export function useSetQuestDoneMutation(teamId: string | null) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (vars: { id: number; done: boolean; member: string }) =>
            rpcSetQuestDone(vars.id, vars.done, vars.member),
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: questsKey(teamId) }),
                queryClient.invalidateQueries({ queryKey: homeKeyPrefix(teamId) }),
            ]),
    });
}
