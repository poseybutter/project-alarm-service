"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";

/** 작성 시점 기준 상대 시간 (몇 분/시간/일 전) */
function timeAgo(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return "방금 전";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}분 전`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}시간 전`;
    const day = Math.floor(hour / 24);
    if (day < 7) return `${day}일 전`;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export default function NotificationButton() {
    const router = useRouter();
    const { notifications, unreadCount, readIds, markAllRead } =
        useNotifications();

    const [open, setOpen] = useState(false);
    // 팝업 열린 시점의 "읽지 않음" 스냅샷 — markAllRead 후에도 amber 점을 유지하기 위함
    const [unreadSnapshot, setUnreadSnapshot] = useState<Set<number>>(
        new Set(),
    );
    const ref = useRef<HTMLDivElement>(null);

    // 바깥 클릭 시 닫기
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    function toggleOpen() {
        setOpen((prev) => {
            const next = !prev;
            if (next) {
                // 열 때: 읽지 않은 알림 스냅샷 저장 후 읽음 처리
                setUnreadSnapshot(
                    new Set(
                        notifications
                            .filter((n) => !readIds.has(n.id))
                            .map((n) => n.id),
                    ),
                );
                void markAllRead();
            }
            return next;
        });
    }

    const preview = notifications.slice(0, 5);

    return (
        <div className="relative" ref={ref}>
            {/* 벨 버튼 */}
            <button
                onClick={toggleOpen}
                className="relative w-8 h-8 flex items-center justify-center"
                aria-label="업데이트 소식"
            >
                <span className="text-xl text-stone-400">🔔</span>
                {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                )}
            </button>

            {/* 드롭다운 팝업 */}
            {open && (
                <div className="absolute right-0 top-10 w-80 bg-white rounded-lg border-2 border-stone-200 shadow-xl z-50 overflow-hidden">
                    {/* 헤더 */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
                        <span className="text-base">🔔</span>
                        <h2 className="text-sm font-bold text-stone-800">
                            업데이트 소식
                        </h2>
                    </div>

                    {/* 본문 */}
                    {preview.length === 0 ? (
                        <div className="py-10 text-center">
                            <p className="text-sm text-stone-500 font-medium">
                                새 업데이트가 없어요 🎮
                            </p>
                        </div>
                    ) : (
                        <div className="max-h-[60vh] overflow-y-auto py-1">
                            {preview.map((n) => {
                                const isUnread = unreadSnapshot.has(n.id);
                                return (
                                    <button
                                        key={n.id}
                                        onClick={() => {
                                            setOpen(false);
                                            router.push("/changelog");
                                        }}
                                        className={`w-full flex items-start gap-2.5 px-4 py-2.5 text-left transition-colors ${isUnread ? "bg-amber-50 hover:bg-amber-100/70" : "hover:bg-stone-50"}`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold leading-none">
                                                    {n.version}
                                                </span>
                                                <span className="text-[11px] text-stone-400 shrink-0">
                                                    {timeAgo(n.created_at)}
                                                </span>
                                            </div>
                                            <p className="text-xs font-medium text-stone-800 truncate">
                                                {n.title}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* 하단: 모두 보기 */}
                    <button
                        onClick={() => {
                            setOpen(false);
                            router.push("/changelog");
                        }}
                        className="w-full px-4 py-2.5 border-t border-stone-100 text-xs font-bold text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                        모두 보기 →
                    </button>
                </div>
            )}
        </div>
    );
}
