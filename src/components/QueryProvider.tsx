"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * 서버 상태 공급자 — 조회 캐싱·중복 제거·무효화는 TanStack Query 가 담당한다.
 * 수제 로딩·세대 가드·취소 플래그 패턴의 대체 (CONTRIBUTING 점진 이행 대상).
 */
export default function QueryProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    // 요청 간 공유 방지 — 인스턴스는 마운트당 1회 생성
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // 기존 동작과 동일: 마운트·키 변경 시 조회, 포커스 리페치 없음
                        refetchOnWindowFocus: false,
                        retry: 1,
                        staleTime: 10_000,
                    },
                },
            }),
    );

    return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}
