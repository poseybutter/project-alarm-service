"use client";

import { useMemo, useState } from "react";
import { Check, Search, ShieldAlert, X } from "lucide-react";
import { useAdmin } from "@/features/admin/components/AdminShell";
import {
  AdminButton,
  AdminDrawer,
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingRows,
  SavingLabel,
  StatusBadge,
  SuccessMessage,
} from "@/features/admin/components/AdminUi";
import { useAdminResource } from "@/features/admin/hooks/useAdminResource";
import type { AccessRequest, ApiFailure } from "@/features/admin/types";

type RequestsResponse = { requests: AccessRequest[] };
type Filter = "pending" | "rejected" | "all";

export function RequestsPage() {
  const { scopes, selectedTeamId } = useAdmin();
  const { data, error, loading, reload } = useAdminResource<RequestsResponse>(
    "/api/admin/requests",
  );
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AccessRequest | null>(null);
  const [teamId, setTeamId] = useState(selectedTeamId ?? "");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<ApiFailure | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const teamScopes = scopes.filter(
    (scope): scope is typeof scope & { teamId: string } =>
      scope.kind === "team" && Boolean(scope.teamId),
  );
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.requests ?? []).filter((request) => {
      if (filter !== "all" && request.status !== filter) return false;
      return (
        !query ||
        request.name.toLowerCase().includes(query) ||
        request.email.toLowerCase().includes(query)
      );
    });
  }, [data, filter, search]);

  function openRequest(request: AccessRequest) {
    setSelected(request);
    setTeamId(request.teamId ?? selectedTeamId ?? teamScopes[0]?.teamId ?? "");
    setRole(request.role === "admin" ? "admin" : "member");
    setActionError(null);
    setConfirmReject(false);
  }

  async function decide(decision: "approve" | "reject") {
    if (!selected || saving) return;
    setSaving(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          decision,
          teamId: decision === "approve" ? teamId : undefined,
          role,
        }),
      });
      const body = (await response.json()) as ApiFailure;
      if (!response.ok) throw body;
      setSuccessMessage(
        `${selected.name}님의 접근 요청을 ${decision === "approve" ? "승인" : "거절"}했습니다.`,
      );
      setSelected(null);
      await reload();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setActionError({
        message: failure.message || "요청을 처리하지 못했습니다.",
        requestId: failure.requestId,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage
      title="접근 요청"
      description="신규 사용자의 소속 팀과 역할을 확인한 뒤 접근을 승인하거나 거절합니다."
    >
      {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">이름 또는 이메일 검색</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            size={15}
          />
          <input
            className="admin-input w-full pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="이름 또는 이메일 검색"
          />
        </label>
        <div
          className="inline-flex h-9 rounded-md border border-stone-200 bg-white p-0.5"
          aria-label="요청 상태 필터"
        >
          {(["pending", "rejected", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`min-w-16 rounded px-2 text-xs font-bold ${filter === value ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100"}`}
              onClick={() => setFilter(value)}
            >
              {value === "pending"
                ? "대기"
                : value === "rejected"
                  ? "거절"
                  : "전체"}
            </button>
          ))}
        </div>
      </div>

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
            search ? "검색 결과가 없습니다" : "대기 중인 접근 요청이 없습니다"
          }
          description={
            search
              ? "이름 또는 이메일 검색어를 바꿔 보세요."
              : "새 접근 요청이 들어오면 이 목록에 표시됩니다."
          }
        />
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="px-3 py-2.5 font-bold">신청자</th>
                <th className="px-3 py-2.5 font-bold">요청 팀</th>
                <th className="px-3 py-2.5 font-bold">상태</th>
                <th className="px-3 py-2.5 font-bold">요청일</th>
                <th className="w-24 px-3 py-2.5 text-right font-bold">검토</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((request) => (
                <tr
                  key={request.id}
                  className="border-t border-stone-100 hover:bg-stone-50"
                >
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => openRequest(request)}
                    >
                      <strong className="block text-[13px] text-stone-900">
                        {request.name}
                      </strong>
                      <span className="mt-0.5 block font-mono text-[10px] text-stone-500">
                        {request.email}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-stone-600">
                    {request.teamName}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={request.status} />
                  </td>
                  <td className="px-3 py-3 font-mono text-[10px] text-stone-500">
                    {formatRequestedAt(request.requestedAt)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <AdminButton
                      variant="secondary"
                      onClick={() => openRequest(request)}
                    >
                      상세
                    </AdminButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminDrawer
        open={Boolean(selected)}
        title="접근 요청 검토"
        onClose={() => !saving && setSelected(null)}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded bg-amber-100 text-sm font-black text-amber-800">
                {selected.name.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <p className="font-extrabold">{selected.name}</p>
                <p className="mt-1 break-all font-mono text-xs text-stone-500">
                  {selected.email}
                </p>
                <p className="mt-2 text-[11px] text-stone-500">
                  요청일 {formatRequestedAt(selected.requestedAt)}
                </p>
              </div>
            </div>

            {selected.status === "pending" ? (
              <>
                <fieldset className="space-y-4">
                  <legend className="text-sm font-extrabold">승인 설정</legend>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-stone-600">
                      배정 팀
                    </span>
                    <select
                      className="admin-select w-full"
                      value={teamId}
                      onChange={(event) => setTeamId(event.target.value)}
                    >
                      <option value="">팀 선택</option>
                      {teamScopes.map((scope) => (
                        <option key={scope.teamId} value={scope.teamId}>
                          {scope.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-stone-600">
                      역할
                    </span>
                    <select
                      className="admin-select w-full"
                      value={role}
                      onChange={(event) =>
                        setRole(event.target.value as "admin" | "member")
                      }
                    >
                      <option value="member">구성원</option>
                      <option value="admin">관리자</option>
                    </select>
                    {role === "admin" && (
                      <span className="mt-2 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                        <ShieldAlert className="mt-0.5 shrink-0" size={16} />
                        관리자는 구성원, 팀 설정과 운영 연동을 변경할 수
                        있습니다.
                      </span>
                    )}
                  </label>
                </fieldset>

                {actionError && (
                  <div
                    role="alert"
                    className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"
                  >
                    {actionError.message}
                    {actionError.requestId && (
                      <span className="mt-1 block font-mono text-[10px]">
                        요청 ID: {actionError.requestId}
                      </span>
                    )}
                  </div>
                )}

                {confirmReject ? (
                  <div className="rounded-md border border-red-300 bg-red-50 p-4">
                    <p className="text-sm font-extrabold text-red-900">
                      이 접근 요청을 거절할까요?
                    </p>
                    <p className="mt-1 text-xs leading-5 text-red-700">
                      사용자는 다시 로그인해도 승인 대기 화면에 진입할 수
                      없습니다.
                    </p>
                    <div className="mt-3 flex justify-end gap-2">
                      <AdminButton
                        onClick={() => setConfirmReject(false)}
                        disabled={saving}
                      >
                        취소
                      </AdminButton>
                      <AdminButton
                        variant="danger"
                        onClick={() => void decide("reject")}
                        disabled={saving}
                      >
                        {saving ? (
                          <SavingLabel label="거절 중" />
                        ) : (
                          <>
                            <X size={14} /> 거절 확정
                          </>
                        )}
                      </AdminButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-4">
                    <AdminButton
                      variant="ghost"
                      onClick={() => setConfirmReject(true)}
                      disabled={saving}
                    >
                      거절
                    </AdminButton>
                    <AdminButton
                      variant="primary"
                      onClick={() => void decide("approve")}
                      disabled={saving || !teamId}
                    >
                      {saving ? (
                        <SavingLabel label="승인 중" />
                      ) : (
                        <>
                          <Check size={14} /> 승인
                        </>
                      )}
                    </AdminButton>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-md border border-stone-200 p-4">
                <StatusBadge status={selected.status} />
                <p className="mt-2 text-xs leading-5 text-stone-600">
                  이미 처리된 요청입니다. 재승인이 필요하면 구성원 관리에서
                  상태를 변경해 주세요.
                </p>
              </div>
            )}
          </div>
        )}
      </AdminDrawer>
    </AdminPage>
  );
}

function formatRequestedAt(value: string | null) {
  if (!value) return "기존 요청";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
