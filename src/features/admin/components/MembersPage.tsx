"use client";

import { useMemo, useState } from "react";
import { Pause, Play, Save, Search, ShieldAlert } from "lucide-react";
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
import type { AdminMember, ApiFailure } from "@/features/admin/types";

type MembersResponse = { members: AdminMember[] };
type MemberFilter = "all" | "active" | "suspended" | "pending";

export function MembersPage() {
  const { identity } = useAdmin();
  const { data, error, loading, reload } =
    useAdminResource<MembersResponse>("/api/admin/members");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [selected, setSelected] = useState<AdminMember | null>(null);
  const [draftRole, setDraftRole] = useState<"admin" | "member">("member");
  const [draftStatus, setDraftStatus] = useState<"active" | "suspended">(
    "active",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiFailure | null>(null);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const members = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.members ?? []).filter((member) => {
      if (filter !== "all" && member.status !== filter) return false;
      return (
        !query ||
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        member.teamName.toLowerCase().includes(query)
      );
    });
  }, [data, filter, search]);

  const dirty = Boolean(
    selected &&
    (selected.role !== draftRole || selected.status !== draftStatus),
  );

  function openMember(member: AdminMember) {
    setSelected(member);
    setDraftRole(member.role === "admin" ? "admin" : "member");
    setDraftStatus(member.status === "suspended" ? "suspended" : "active");
    setSaveError(null);
    setDiscardPrompt(false);
  }

  function closeDrawer() {
    if (saving) return;
    if (dirty) {
      setDiscardPrompt(true);
      return;
    }
    setSelected(null);
  }

  async function saveMember() {
    if (!selected?.teamId || !dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          teamId: selected.teamId,
          role: draftRole,
          status: draftStatus,
        }),
      });
      const body = (await response.json()) as ApiFailure;
      if (!response.ok) throw body;
      setSuccessMessage(`${selected.name}님의 권한과 상태를 저장했습니다.`);
      setSelected(null);
      await reload();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setSaveError({
        message: failure.message || "구성원 정보를 저장하지 못했습니다.",
        requestId: failure.requestId,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage
      title="구성원 관리"
      description="구성원의 팀 역할과 계정 상태를 관리합니다. 계정 삭제 대신 정지 상태를 사용합니다."
    >
      {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">구성원 검색</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            size={15}
          />
          <input
            className="admin-input w-full pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="이름, 이메일, 팀 검색"
          />
        </label>
        <label>
          <span className="sr-only">상태 필터</span>
          <select
            className="admin-select w-full sm:w-36"
            value={filter}
            onChange={(event) => setFilter(event.target.value as MemberFilter)}
          >
            <option value="all">모든 상태</option>
            <option value="active">활성</option>
            <option value="suspended">정지</option>
            <option value="pending">승인 대기</option>
          </select>
        </label>
      </div>

      {loading && <LoadingRows count={7} />}
      {error && (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={reload}
        />
      )}
      {!loading && !error && members.length === 0 && (
        <EmptyState
          title="조건에 맞는 구성원이 없습니다"
          description="검색어 또는 상태 필터를 변경해 주세요."
        />
      )}
      {!loading && !error && members.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="px-3 py-2.5 font-bold">구성원</th>
                <th className="px-3 py-2.5 font-bold">팀</th>
                <th className="px-3 py-2.5 font-bold">역할</th>
                <th className="px-3 py-2.5 font-bold">상태</th>
                <th className="px-3 py-2.5 text-right font-bold">레벨</th>
                <th className="w-24 px-3 py-2.5 text-right font-bold">관리</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.id}
                  className="border-t border-stone-100 hover:bg-stone-50"
                >
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-left"
                      onClick={() => openMember(member)}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded bg-stone-100 font-bold text-stone-700">
                        {member.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0">
                        <strong className="block text-[13px] text-stone-900">
                          {member.name}
                          {member.email === identity.email && (
                            <span className="ml-1 text-[10px] text-amber-700">
                              나
                            </span>
                          )}
                        </strong>
                        <span className="block font-mono text-[10px] text-stone-500">
                          {member.email}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-stone-600">
                    {member.teamName}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={member.role} />
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={member.status} />
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {member.level ?? "-"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <AdminButton onClick={() => openMember(member)}>
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
        title="구성원 상세"
        onClose={closeDrawer}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded bg-amber-100 text-base font-black text-amber-800">
                {selected.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-extrabold">{selected.name}</p>
                  <StatusBadge status={selected.status} />
                </div>
                <p className="mt-1 break-all font-mono text-xs text-stone-500">
                  {selected.email}
                </p>
                <p className="mt-2 text-xs text-stone-600">
                  {selected.teamName} · Lv.{selected.level ?? "-"}
                </p>
              </div>
            </div>

            {selected.status === "pending" ||
            selected.status === "rejected" ||
            !selected.teamId ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                이 사용자는 접근 요청 단계에 있습니다. 접근 요청 화면에서 팀과
                역할을 지정해 주세요.
              </div>
            ) : (
              <fieldset className="space-y-4">
                <legend className="text-sm font-extrabold">권한 및 상태</legend>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-stone-600">
                    팀 역할
                  </span>
                  <select
                    className="admin-select w-full"
                    value={draftRole}
                    onChange={(event) =>
                      setDraftRole(event.target.value as "admin" | "member")
                    }
                    disabled={selected.email === identity.email}
                  >
                    <option value="member">구성원</option>
                    <option value="admin">관리자</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-stone-600">
                    계정 상태
                  </span>
                  <select
                    className="admin-select w-full"
                    value={draftStatus}
                    onChange={(event) =>
                      setDraftStatus(
                        event.target.value as "active" | "suspended",
                      )
                    }
                    disabled={selected.email === identity.email}
                  >
                    <option value="active">활성</option>
                    <option value="suspended">정지</option>
                  </select>
                </label>
                {selected.email === identity.email && (
                  <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    <ShieldAlert className="mt-0.5 shrink-0" size={16} />
                    자신의 관리자 권한과 계정 상태는 직접 변경할 수 없습니다.
                  </div>
                )}
                {draftStatus === "suspended" &&
                  selected.status !== "suspended" && (
                    <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
                      <Pause className="mt-0.5 shrink-0" size={16} />
                      정지하면 이 사용자는 로그인 후 업무 데이터에 접근할 수
                      없습니다. 기존 데이터는 삭제되지 않습니다.
                    </div>
                  )}
                {draftStatus === "active" &&
                  selected.status === "suspended" && (
                    <div className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                      <Play className="mt-0.5 shrink-0" size={16} />
                      저장 즉시 계정 접근이 복구됩니다.
                    </div>
                  )}
              </fieldset>
            )}

            {saveError && (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"
              >
                {saveError.message}
                {saveError.requestId && (
                  <span className="mt-1 block font-mono text-[10px]">
                    요청 ID: {saveError.requestId}
                  </span>
                )}
              </div>
            )}

            {discardPrompt ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-extrabold text-amber-950">
                  저장하지 않은 변경사항이 있습니다
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  변경사항을 버리고 상세 화면을 닫을까요?
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <AdminButton onClick={() => setDiscardPrompt(false)}>
                    계속 편집
                  </AdminButton>
                  <AdminButton
                    variant="primary"
                    onClick={() => setSelected(null)}
                  >
                    변경 버리기
                  </AdminButton>
                </div>
              </div>
            ) : selected.teamId &&
              selected.status !== "pending" &&
              selected.status !== "rejected" ? (
              <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
                <AdminButton onClick={closeDrawer} disabled={saving}>
                  취소
                </AdminButton>
                <AdminButton
                  variant="primary"
                  onClick={() => void saveMember()}
                  disabled={
                    !dirty || saving || selected.email === identity.email
                  }
                >
                  {saving ? (
                    <SavingLabel />
                  ) : (
                    <>
                      <Save size={14} /> 변경 저장
                    </>
                  )}
                </AdminButton>
              </div>
            ) : null}
          </div>
        )}
      </AdminDrawer>
    </AdminPage>
  );
}
