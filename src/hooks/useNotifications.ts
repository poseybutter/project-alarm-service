"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/infrastructure/supabase/client";
import { useAuth } from "@/components/AuthProvider";

// 구독마다 고유한 채널 이름을 보장하기 위한 카운터.
// supabase.channel(topic)은 같은 topic이 이미 있으면 "기존(이미 subscribe된) 채널"을
// 그대로 반환하는데, 그 채널에 .on()을 다시 호출하면
// "cannot add postgres_changes callbacks after subscribe()" 에러가 난다.
// 이 훅이 여러 컴포넌트(NotificationButton·changelog 등)에서 동시에 쓰이거나
// StrictMode로 재마운트될 때 topic이 충돌하므로 매 구독마다 이름을 고유화한다.
let channelSeq = 0;

export type Notification = {
    id: number;
    version: string;
    title: string;
    body: string;
    commit_sha: string | null;
    created_at: string;
};

/**
 * 버전 업데이트(changelog) 알림 훅.
 * - 읽지 않은 알림 개수 (unreadCount)
 * - markAllRead(): 모든 알림 읽음 처리
 * - Supabase realtime으로 새 알림 실시간 감지
 *
 * notification_reads RLS는 player_id = (players.email = jwt email) 기준이므로,
 * 본인의 player id를 이메일로 조회해 둔다.
 */
export function useNotifications() {
    const { user } = useAuth();
    const email = user?.email ?? null;

    const [playerId, setPlayerId] = useState<number | null>(null);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [readIds, setReadIds] = useState<Set<number>>(new Set());

    // 1. 이메일 → player id
    useEffect(() => {
        let cancelled = false;
        if (!email) {
            setPlayerId(null);
            return;
        }
        void (async () => {
            const { data } = await supabase
                .from("players")
                .select("id")
                .eq("email", email)
                .maybeSingle();
            if (!cancelled) setPlayerId(data?.id ?? null);
        })();
        return () => {
            cancelled = true;
        };
    }, [email]);

    // 2. 알림 목록 + 읽음 상태 로드
    const load = useCallback(async () => {
        const { data: notifs } = await supabase
            .from("notifications")
            .select("*")
            .order("created_at", { ascending: false });
        setNotifications((notifs as Notification[]) ?? []);

        if (playerId == null) {
            setReadIds(new Set());
            return;
        }
        const { data: reads } = await supabase
            .from("notification_reads")
            .select("notification_id")
            .eq("player_id", playerId);
        setReadIds(
            new Set((reads ?? []).map((r) => r.notification_id as number)),
        );
    }, [playerId]);

    useEffect(() => {
        void load();
    }, [load, playerId]);

    // 3. realtime 구독: 새 알림 + 본인 읽음 변경
    useEffect(() => {
        const channel = supabase
            .channel(`notifications-realtime-${++channelSeq}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "notifications" },
                () => {
                    void load();
                },
            );
        // 읽음 변경은 본인 것만 화면에 영향을 준다.
        // 필터 없이 구독하면 다른 사용자의 읽음 처리마다 리페치가 돈다.
        if (playerId != null) {
            channel.on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "notification_reads",
                    filter: `player_id=eq.${playerId}`,
                },
                () => {
                    void load();
                },
            );
        }
        channel.subscribe();

        return () => {
            supabase.removeChannel(channel).catch(console.error);
        };
    }, [load, playerId]);

    // 4. 모든 알림 읽음 처리
    const markAllRead = useCallback(async () => {
        if (playerId == null) return;
        const unread = notifications.filter((n) => !readIds.has(n.id));
        if (unread.length === 0) return;

        // 낙관적 업데이트
        setReadIds((prev) => {
            const next = new Set(prev);
            unread.forEach((n) => next.add(n.id));
            return next;
        });

        const { error } = await supabase.from("notification_reads").upsert(
            unread.map((n) => ({ player_id: playerId, notification_id: n.id })),
            { onConflict: "player_id,notification_id", ignoreDuplicates: true },
        );
        if (error) {
            console.error("[markAllRead]", error.message);
            void load(); // 실패 시 서버 상태로 복구
        }
    }, [playerId, notifications, readIds, load]);

    const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

    return { notifications, unreadCount, readIds, markAllRead, reload: load };
}
