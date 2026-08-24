"use client";

import { useMemo, useState } from "react";
import { FileClock, Search } from "lucide-react";
import {
  activityLabel,
  formatDateTime,
} from "@/features/admin/components/DashboardPage";
import {
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/features/admin/components/AdminUi";
import { useAdminResource } from "@/features/admin/hooks/useAdminResource";
import type { AdminActivity } from "@/features/admin/types";

type LogsResponse = { logs: AdminActivity[] };

export function LogsPage() {
  const { data, error, loading, reload } =
    useAdminResource<LogsResponse>("/api/admin/logs");
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.logs ?? []).filter(
      (row) =>
        !query ||
        row.actorEmail.toLowerCase().includes(query) ||
        row.targetLabel.toLowerCase().includes(query) ||
        activityLabel(row.action).includes(query),
    );
  }, [data, search]);

  return (
    <AdminPage
      title="감사 로그"
      description="승인, 권한, 계정 상태와 팀 변경 이력을 최신순으로 확인합니다."
    >
      <label className="relative mb-3 block max-w-sm">
        <span className="sr-only">감사 로그 검색</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          size={15}
        />
        <input
          className="admin-input w-full pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="작업, 대상, 관리자 이메일 검색"
        />
      </label>
      {loading && <LoadingRows count={6} />}
      {error && (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={reload}
        />
      )}
      {!loading && !error && rows.length === 0 && (
        <EmptyState
          title={
            search ? "검색 결과가 없습니다" : "기록된 변경 이력이 없습니다"
          }
          description={
            search
              ? "검색 조건을 바꿔 보세요."
              : "V29 적용 후 관리자 변경 작업부터 기록됩니다."
          }
        />
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-hidden rounded-md border border-stone-200 bg-white">
          {rows.map((row) => (
            <article
              key={row.id}
              className="flex gap-3 border-t border-stone-100 px-4 py-3 first:border-t-0"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded border border-stone-200 bg-stone-50 text-stone-500">
                <FileClock size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold text-stone-800">
                  {activityLabel(row.action)}
                </p>
                <p className="mt-0.5 text-xs text-stone-600">
                  대상: {row.targetLabel}
                </p>
                <p className="mt-1 break-all font-mono text-[10px] text-stone-400">
                  {formatDateTime(row.createdAt)} · {row.actorEmail}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
