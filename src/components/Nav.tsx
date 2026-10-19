"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import type { ModuleKey } from "@/features/team-context/types";
import TeamSwitcher from "./TeamSwitcher";
import NotificationButton from "./NotificationButton";
import UserMenu from "./UserMenu";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const navStyle = { "--nav-height": "67px" } as CSSProperties;

const NAV_ITEMS: { href: string; icon: string; label: string; module: ModuleKey | null }[] = [
    { href: "/home",    icon: "🏠", label: "홈",    module: null },
    { href: "/tasks",   icon: "📋", label: "업무",  module: "tasks" },
    { href: "/report",  icon: "✏️", label: "리포트", module: "report" },
    { href: "/manage",  icon: "🗂️", label: "관리",  module: "manage" },
    { href: "/profile", icon: "🍄", label: "프로필", module: null },
];

const STORAGE_KEY = "sidebar-collapsed";

export default function Nav() {
    const { member, loading, modules } = useAuth();
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
    }, []);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, String(collapsed));
        document.body.dataset.sidebar = collapsed ? "collapsed" : "expanded";
    }, [collapsed]);

    const toggle = useCallback(() => setCollapsed((c) => !c), []);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    if (loading || !member) return null;
    if (pathname === "/login" || pathname.startsWith("/admin")) return null;

    const visibleItems = NAV_ITEMS.filter(
        (item) => item.module === null || modules.has(item.module),
    );

    return (
        <>
            {/* 모바일: 하단 네비게이션 */}
            <nav
                className="fixed bottom-0 left-0 right-0 z-50 box-border h-[67px] min-h-[67px] border-t border-stone-200 bg-white lg:hidden"
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

            {/* PC: 좌측 사이드바 */}
            <aside
                className={`hidden lg:flex fixed left-0 top-0 bottom-0 z-50 flex-col border-r border-stone-200 bg-white transition-[width] duration-200 overflow-visible ${
                    collapsed ? "w-[56px]" : "w-[200px]"
                }`}
            >
                {/* 상단: 팀 전환 + 토글 */}
                <div className={`flex items-center py-4 ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
                    {!collapsed && <TeamSwitcher />}
                    <button
                        type="button"
                        onClick={toggle}
                        className="p-1.5 rounded text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                        aria-label={collapsed ? "사이드바 열기" : "사이드바 접기"}
                    >
                        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
                    </button>
                </div>

                {/* 네비게이션 */}
                <nav className="flex-1 py-2 space-y-1 overflow-hidden">
                    {visibleItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`group relative flex items-center gap-3 mx-2 rounded-lg text-sm font-medium transition-colors ${
                                collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
                            } ${pathname === item.href
                                ? "bg-amber-50 text-amber-700"
                                : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"}`}
                        >
                            <span className="text-lg leading-none shrink-0">{item.icon}</span>
                            {!collapsed && <span>{item.label}</span>}
                            {collapsed && (
                                <span className="pointer-events-none absolute left-full ml-2 hidden rounded-md bg-stone-800 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block whitespace-nowrap">
                                    {item.label}
                                </span>
                            )}
                        </Link>
                    ))}
                </nav>

                {/* 하단: 알림 + 유저 */}
                <div className={`py-3 border-t border-stone-100 flex items-center ${collapsed ? "flex-col gap-2 px-2" : "justify-between px-4"}`}>
                    <NotificationButton dropUp />
                    <UserMenu dropUp />
                </div>
            </aside>
        </>
    );
}
