"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";

const navStyle = { "--nav-height": "67px" } as CSSProperties;

const NAV_ITEMS = [
    { href: "/", icon: "🏠", label: "홈" },
    { href: "/tasks", icon: "📋", label: "업무" },
    { href: "/report", icon: "✏️", label: "리포트" },
    { href: "/manage", icon: "🗂️", label: "관리" },
    { href: "/profile", icon: "🍄", label: "프로필" },
];

export default function Nav() {
    const { member, loading } = useAuth();
    const pathname = usePathname();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    if (loading || !member) return null;
    if (pathname === "/login") return null;
    // 관리자 화면은 자체 레이아웃을 사용하므로 하단 네비 숨김
    if (pathname.startsWith("/admin")) return null;

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 box-border h-[67px] min-h-[67px] border-t border-stone-200 bg-white"
            style={navStyle}
        >
            <div className="mx-auto flex h-full max-w-2xl items-stretch justify-between">
                {NAV_ITEMS.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-[0.4rem] px-0.5 py-0 transition-colors
              ${pathname === item.href ? "text-amber-600" : "text-stone-400"}`}
                    >
                        <span className="text-lg leading-none">
                            {item.icon}
                        </span>
                        <span className="text-[11px] font-medium leading-tight text-center">
                            {item.label}
                        </span>
                    </Link>
                ))}
            </div>
        </nav>
    );
}
