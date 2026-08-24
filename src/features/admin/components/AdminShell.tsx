"use client";

import { createContext, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Blocks,
  Cable,
  ChevronDown,
  ClipboardList,
  FileClock,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { AdminBootstrap, AdminScope } from "@/features/admin/types";

type AdminContextValue = AdminBootstrap & {
  selectedTeamId: string | null;
  selectedScope: AdminScope;
};

const AdminContext = createContext<AdminContextValue | null>(null);

const NAVIGATION = [
  {
    label: "운영",
    items: [
      { href: "/admin", label: "대시보드", icon: LayoutDashboard },
      {
        href: "/admin/requests",
        label: "접근 요청",
        icon: ClipboardList,
      },
      { href: "/admin/members", label: "구성원", icon: Users },
      { href: "/admin/teams", label: "팀", icon: Blocks },
    ],
  },
  {
    label: "보안 및 시스템",
    items: [
      { href: "/admin/roles", label: "역할 및 권한", icon: ShieldCheck },
      { href: "/admin/logs", label: "감사 로그", icon: FileClock },
      { href: "/admin/integrations", label: "연동", icon: Cable },
    ],
  },
] as const;

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminShell");
  return value;
}

export function AdminShell({
  bootstrap,
  children,
}: {
  bootstrap: AdminBootstrap;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const queryTeamId = searchParams.get("team");
  const selectedScope =
    bootstrap.scopes.find((scope) => scope.teamId === queryTeamId) ??
    bootstrap.currentScope;

  const contextValue = useMemo(
    () => ({
      ...bootstrap,
      selectedTeamId: selectedScope.teamId,
      selectedScope,
    }),
    [bootstrap, selectedScope],
  );

  function changeScope(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "organization") params.delete("team");
    else params.set("team", value);
    router.push(`${pathname}${params.size ? `?${params}` : ""}`);
  }

  return (
    <AdminContext.Provider value={contextValue}>
      <div className="admin-root min-h-dvh bg-stone-50 text-stone-900">
        <a className="admin-skip-link" href="#admin-content">
          본문으로 건너뛰기
        </a>
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-stone-200 bg-white lg:flex lg:flex-col">
          <Brand />
          <div className="border-b border-stone-200 p-3">
            <ScopeSelect
              scopes={bootstrap.scopes}
              value={selectedScope.teamId ?? "organization"}
              onChange={changeScope}
            />
          </div>
          <AdminNavigation
            pathname={pathname}
            query={searchParams.toString()}
          />
          <AccountFooter bootstrap={bootstrap} />
        </aside>

        <div className="min-h-dvh lg:pl-60">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-stone-200 bg-white px-3 lg:px-5">
            <button
              type="button"
              className="admin-icon-button lg:hidden"
              aria-label="관리자 메뉴 열기"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={19} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold">
                {pageTitle(pathname)}
              </p>
              <p className="truncate text-[11px] text-stone-500 lg:hidden">
                {selectedScope.label}
              </p>
            </div>
            <div className="hidden w-52 sm:block lg:hidden">
              <ScopeSelect
                scopes={bootstrap.scopes}
                value={selectedScope.teamId ?? "organization"}
                onChange={changeScope}
                compact
              />
            </div>
            <span className="hidden rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 lg:inline-flex">
              {selectedScope.label}
            </span>
          </header>
          <main id="admin-content" tabIndex={-1}>
            {children}
          </main>
        </div>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-stone-950/35"
              aria-label="관리자 메뉴 닫기"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="relative flex h-full w-[min(86vw,320px)] flex-col border-r-2 border-stone-900 bg-white shadow-xl">
              <div className="flex items-center border-b border-stone-200 pr-3">
                <Brand />
                <button
                  type="button"
                  className="admin-icon-button ml-auto"
                  aria-label="관리자 메뉴 닫기"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="border-b border-stone-200 p-3">
                <ScopeSelect
                  scopes={bootstrap.scopes}
                  value={selectedScope.teamId ?? "organization"}
                  onChange={changeScope}
                />
              </div>
              <AdminNavigation
                pathname={pathname}
                query={searchParams.toString()}
                onNavigate={() => setMobileMenuOpen(false)}
              />
              <AccountFooter bootstrap={bootstrap} />
            </aside>
          </div>
        )}
      </div>
    </AdminContext.Provider>
  );
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 px-4">
      <span className="grid size-7 place-items-center rounded bg-stone-900 font-mono text-[11px] font-black text-amber-400">
        UD
      </span>
      <strong className="text-sm">UD2 업무 관리</strong>
      <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800">
        관리자
      </span>
    </div>
  );
}

function ScopeSelect({
  scopes,
  value,
  onChange,
  compact = false,
}: {
  scopes: AdminScope[];
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">관리 범위</span>
      <select
        className={`admin-select w-full pr-8 ${compact ? "h-9" : "h-10"}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {scopes.map((scope) => (
          <option
            key={`${scope.kind}-${scope.teamId ?? "all"}`}
            value={scope.teamId ?? "organization"}
          >
            {scope.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        size={15}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500"
      />
    </label>
  );
}

function AdminNavigation({
  pathname,
  query,
  onNavigate,
}: {
  pathname: string;
  query: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto p-2" aria-label="관리자 메뉴">
      {NAVIGATION.map((group) => (
        <div key={group.label} className="mb-4">
          <p className="px-2 pb-1.5 pt-1 text-[10px] font-extrabold text-stone-400">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={`${item.href}${query ? `?${query}` : ""}`}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-2 rounded-md border px-2.5 text-[13px] font-bold transition-colors ${
                    active
                      ? "border-stone-300 border-l-2 border-l-amber-500 bg-white text-stone-950"
                      : "border-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                >
                  <Icon
                    size={16}
                    className={active ? "text-amber-700" : "text-stone-400"}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AccountFooter({ bootstrap }: { bootstrap: AdminBootstrap }) {
  return (
    <div className="border-t border-stone-200 p-2">
      <Link
        href="/manage"
        className="flex min-h-10 items-center gap-2 rounded-md px-2 text-xs font-bold text-stone-600 hover:bg-stone-100"
      >
        <ArrowLeft size={15} /> 사용자 화면으로 돌아가기
      </Link>
      <div className="mt-1 flex items-center gap-2 rounded-md px-2 py-2">
        <span className="grid size-8 shrink-0 place-items-center rounded bg-amber-100 text-xs font-black text-amber-800">
          {bootstrap.identity.name.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-xs">
            {bootstrap.identity.name}
          </strong>
          <span className="block truncate text-[10px] text-stone-500">
            {bootstrap.identity.email}
          </span>
        </span>
      </div>
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname.startsWith("/admin/requests")) return "접근 요청";
  if (pathname.startsWith("/admin/members")) return "구성원 관리";
  if (pathname.startsWith("/admin/teams")) return "팀 관리";
  if (pathname.startsWith("/admin/roles")) return "역할 및 권한";
  if (pathname.startsWith("/admin/logs")) return "감사 로그";
  if (pathname.startsWith("/admin/integrations")) return "연동 관리";
  return "관리자 대시보드";
}
