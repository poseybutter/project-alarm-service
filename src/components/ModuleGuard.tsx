"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import type { ModuleKey } from "@/features/team-context/types";

interface ModuleGuardProps {
    module: ModuleKey;
    children: React.ReactNode;
}

export default function ModuleGuard({ module, children }: ModuleGuardProps) {
    const { loading, modules } = useAuth();

    if (loading) return null;

    if (!modules.has(module)) {
        return (
            <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
                <span className="text-3xl">🔒</span>
                <p className="text-sm font-extrabold text-stone-800">
                    비활성화된 기능입니다
                </p>
                <p className="text-xs leading-5 text-stone-500">
                    이 팀에서는 사용하지 않는 기능입니다.
                    <br />
                    필요하다면 팀 관리자에게 활성화를 요청해 주세요.
                </p>
                <Link
                    href="/home"
                    className="mt-2 rounded-md border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700 transition-colors hover:bg-stone-50"
                >
                    홈으로
                </Link>
            </div>
        );
    }

    return <>{children}</>;
}
