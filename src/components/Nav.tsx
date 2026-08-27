"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";
import type { ModuleKey } from "@/features/team-context/types";

const navStyle = { "--nav-height": "67px" } as CSSProperties;

const NAV_ITEMS: { href: string; icon: string; label: string; module: ModuleKey | null }[] = [
    { href: "/home",    icon: "🏠", label: "홈",    module: null },
    { href: "/tasks",   icon: "📋", label: "업무",  module: "tasks" },
    { href: "/report",  icon: "✏️", label: "리포트", module: "report" },
    { href: "/manage",  icon: "🗂️", label: "관리",  module: "manage" },
    { href: "/profile", icon: "🍄", label: "프로필", module: null },
];

export default function Nav() {
    const { member, loading, modules } = useAuth();
    const pathname = usePathname();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    if (loading || !member) return null;
    if (pathname === "/login" || pathname.startsWith("/admin")) return null;

    const visibleItems = NAV_ITEMS.filter(
        (item) => item.module === null || modules.has(item.module),
    );

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 box-border h-[67px] min-h-[67px] border-t border-stone-200 bg-white"
            style={navStyle}
        >
            <div className="mx-auto flex h-full max-w-2xl items-stretch justify-between">
                {visibleItems.map((item) => (
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
