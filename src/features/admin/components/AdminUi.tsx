"use client";

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AlertTriangle, Inbox, LoaderCircle, X } from "lucide-react";

export function AdminPage({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1280px] p-3 sm:p-5">
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-stone-950">{title}</h2>
          <p className="mt-1 text-[13px] leading-5 text-stone-500">
            {description}
          </p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function AdminButton({
  variant = "secondary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const variants = {
    primary: "border-amber-600 bg-amber-400 text-amber-950 hover:bg-amber-300",
    secondary:
      "border-stone-300 bg-white text-stone-800 hover:border-stone-500 hover:bg-stone-50",
    danger: "border-red-700 bg-red-600 text-white hover:bg-red-700",
    ghost:
      "border-transparent bg-transparent text-stone-600 hover:bg-stone-100",
  };
  return (
    <button
      type="button"
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    active: "활성",
    pending: "승인 대기",
    suspended: "정지",
    rejected: "거절",
    admin: "관리자",
    member: "구성원",
  };
  const tone =
    status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "pending" || status === "admin"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : status === "suspended" || status === "rejected"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-stone-200 bg-stone-100 text-stone-700";
  return (
    <span
      className={`inline-flex min-h-5 items-center rounded border px-1.5 text-[10px] font-extrabold ${tone}`}
    >
      {label[status] ?? status}
    </span>
  );
}

export function LoadingRows({ count = 5 }: { count?: number }) {
  return (
    <div className="overflow-hidden rounded-md border border-stone-200 bg-white">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex h-16 items-center gap-3 border-t border-stone-100 px-4 first:border-t-0"
        >
          <span className="admin-skeleton size-8 rounded" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="admin-skeleton block h-3 w-1/3 rounded" />
            <span className="admin-skeleton block h-2.5 w-1/2 rounded" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-56 place-items-center rounded-md border border-stone-200 bg-white p-6 text-center">
      <div>
        <Inbox className="mx-auto text-stone-300" size={28} />
        <p className="mt-3 text-sm font-extrabold">{title}</p>
        <p className="mt-1 max-w-md text-xs leading-5 text-stone-500">
          {description}
        </p>
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  requestId,
  onRetry,
}: {
  message: string;
  requestId?: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-5">
      <div className="flex gap-3">
        <AlertTriangle className="shrink-0 text-red-700" size={20} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-red-900">
            데이터를 불러오지 못했습니다
          </p>
          <p className="mt-1 text-xs leading-5 text-red-800">{message}</p>
          {requestId && (
            <p className="mt-1 font-mono text-[10px] text-red-600">
              요청 ID: {requestId}
            </p>
          )}
          <AdminButton className="mt-3" variant="secondary" onClick={onRetry}>
            다시 시도
          </AdminButton>
        </div>
      </div>
    </div>
  );
}

export function SavingLabel({ label = "저장 중" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <LoaderCircle className="animate-spin" size={14} /> {label}
    </span>
  );
}

export function SuccessMessage({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-800"
    >
      {children}
    </div>
  );
}

export function AdminDrawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    window.setTimeout(() => focusable()[0]?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-stone-950/35"
        aria-label="상세 화면 닫기"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-lg flex-col border-l-2 border-stone-900 bg-white shadow-2xl"
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-stone-200 px-4">
          <h2
            id={titleId}
            className="min-w-0 flex-1 truncate text-base font-extrabold"
          >
            {title}
          </h2>
          <button
            type="button"
            className="admin-icon-button"
            aria-label="닫기"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
