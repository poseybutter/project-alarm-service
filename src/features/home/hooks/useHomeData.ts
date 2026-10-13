"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchHomeData, type HomeData } from "@/features/home/api/homeApi";

export const homeKey = (teamId: string | null, member: string | null) =>
    ["home", teamId, member] as const;

export function useHomeDataQuery(
    teamId: string | null,
    member: string | null,
    isGuest: boolean,
) {
    return useQuery({
        queryKey: homeKey(teamId, member),
        queryFn: () => fetchHomeData(teamId!, member!, isGuest),
        enabled: Boolean(teamId && member),
    });
}

/** 재조회 트리거 — 기존 loadData() 호출부 호환용. 중복 요청 병합은 Query 담당 */
export function useReloadHomeData(
    teamId: string | null,
    member: string | null,
) {
    const queryClient = useQueryClient();
    return useCallback(
        () => queryClient.invalidateQueries({ queryKey: homeKey(teamId, member) }),
        [queryClient, teamId, member],
    );
}

/** 낙관적 갱신용 — 홈 캐시를 부분 수정 (완료 애니메이션 등 즉시 반영 경로) */
export function useUpdateHomeCache(
    teamId: string | null,
    member: string | null,
) {
    const queryClient = useQueryClient();
    return useCallback(
        (updater: (prev: HomeData) => HomeData) => {
            queryClient.setQueryData<HomeData>(
                homeKey(teamId, member),
                (prev) => (prev ? updater(prev) : prev),
            );
        },
        [queryClient, teamId, member],
    );
}
