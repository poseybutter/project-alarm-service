"use client";

import { useEffect } from "react";
import AuthGuard from "@/components/AuthGuard";
import Header from "@/components/Header";
import { useNotifications } from "@/hooks/useNotifications";
import { timeAgo } from "@/lib/utils";

export default function ChangelogPage() {
    const { notifications, markAllRead } = useNotifications();

    // 페이지 진입 시 자동 읽음 처리
    useEffect(() => {
        void markAllRead();
    }, [markAllRead]);

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f7f6f3]">
                <Header title="업데이트 소식" subtitle="새 버전 변경 내역" />

                <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
                    {notifications.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-stone-200 py-16 text-center">
                            <div className="text-3xl mb-2">📭</div>
                            <p className="text-sm text-stone-500 font-medium">
                                아직 업데이트 소식이 없어요
                            </p>
                            <p className="text-xs text-stone-300 mt-1">
                                새 버전이 배포되면 여기에 표시돼요
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {notifications.map((n) => (
                                <div
                                    key={n.id}
                                    className="bg-white rounded-2xl border border-stone-200 p-4"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">
                                            {n.version}
                                        </span>
                                        <span className="text-xs text-stone-400">
                                            {timeAgo(n.created_at)}
                                        </span>
                                    </div>
                                    <h2 className="text-sm font-bold text-stone-900 mb-1.5">
                                        {n.title}
                                    </h2>
                                    <p className="text-sm text-stone-600 whitespace-pre-wrap break-words leading-relaxed">
                                        {n.body}
                                    </p>
                                    {n.commit_sha && (
                                        <p className="mt-2 text-[11px] font-mono text-stone-300">
                                            {n.commit_sha.slice(0, 7)}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
