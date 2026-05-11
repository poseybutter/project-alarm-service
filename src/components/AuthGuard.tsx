"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { PageSpinner } from "./Spinner";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const { member, loading: authLoading } = useAuth();

    if (authLoading) {
        return (
            <div className="min-h-screen bg-[#f7f6f3] flex items-center justify-center">
                <PageSpinner />
            </div>
        );
    }

    if (!member) {
        return (
            <div className="min-h-screen bg-[#f7f6f3] flex flex-col items-center justify-center px-6">
                <div className="bg-white rounded-2xl border border-stone-200 p-8 max-w-sm w-full text-center shadow-sm">
                    <div className="text-5xl mb-4">🔒</div>
                    <h2 className="text-lg font-bold text-stone-800 mb-2">
                        접근할 수 없어요
                    </h2>
                    <p className="text-sm text-stone-400 mb-6 leading-relaxed">
                        이 페이지는 허가된 계정만
                        <br />
                        접근할 수 있어요.
                    </p>
                    <Link
                        href="/login"
                        className="block w-full bg-amber-500 text-white font-bold py-3 rounded-xl text-sm hover:bg-amber-600 transition-colors"
                    >
                        로그인하기
                    </Link>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
