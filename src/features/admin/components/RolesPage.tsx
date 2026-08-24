"use client";

import { useMemo, useState } from "react";
import {
  Check,
  LockKeyhole,
  Minus,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useAdmin } from "@/features/admin/components/AdminShell";
import {
  AdminButton,
  AdminDrawer,
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingRows,
  SavingLabel,
  SuccessMessage,
} from "@/features/admin/components/AdminUi";
import { useAdminResource } from "@/features/admin/hooks/useAdminResource";
import type {
  AdminPermission,
  AdminRoleCatalog,
  AdminRoleDefinition,
  ApiFailure,
} from "@/features/admin/types";

type Draft = {
  id?: string;
  key: string;
  name: string;
  description: string;
  permissions: AdminPermission[];
};

const EMPTY_DRAFT: Draft = {
  key: "",
  name: "",
  description: "",
  permissions: [],
};

export function RolesPage() {
  const { selectedTeamId, selectedScope } = useAdmin();
  const { data, error, loading, reload } =
    useAdminResource<AdminRoleCatalog>("/api/admin/roles");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminRoleDefinition | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<ApiFailure | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);

  const canManage = selectedScope.permissions.includes("roles.manage");
  const roles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.roles ?? []).filter(
      (role) =>
        !query ||
        role.name.toLowerCase().includes(query) ||
        role.key.toLowerCase().includes(query) ||
        role.teamName.toLowerCase().includes(query),
    );
  }, [data, search]);

  const originalPermissions = selected?.permissions ?? [];
  const dirty = Boolean(
    drawerOpen &&
      !selected?.isSystem &&
      (draft.name !== (selected?.name ?? "") ||
        draft.key !== (selected?.key ?? "") ||
        draft.description !== (selected?.description ?? "") ||
        [...draft.permissions].sort().join("|") !==
          [...originalPermissions].sort().join("|")),
  );

  function openRole(role: AdminRoleDefinition) {
    setSelected(role);
    setDraft({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description ?? "",
      permissions: [...role.permissions],
    });
    setActionError(null);
    setConfirmDelete(false);
    setDiscardPrompt(false);
    setDrawerOpen(true);
  }

  function openCreate() {
    if (!selectedTeamId) return;
    setSelected(null);
    setDraft(EMPTY_DRAFT);
    setActionError(null);
    setConfirmDelete(false);
    setDiscardPrompt(false);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (saving) return;
    if (dirty) {
      setDiscardPrompt(true);
      return;
    }
    setDrawerOpen(false);
  }

  function togglePermission(permission: AdminPermission) {
    setDraft((current) => {
      const enabled = current.permissions.includes(permission);
      let permissions = enabled
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission];
      if (permission === "admin.read" && enabled) permissions = [];
      if (permissions.length > 0 && !permissions.includes("admin.read")) {
        permissions = ["admin.read", ...permissions];
      }
      return { ...current, permissions };
    });
  }

  async function saveRole() {
    if (!selectedTeamId || saving || selected?.isSystem) return;
    setSaving(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/roles", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, teamId: selectedTeamId }),
      });
      const body = (await response.json()) as ApiFailure;
      if (!response.ok) throw body;
      setSuccessMessage(
        draft.id ? "역할과 권한을 저장했습니다." : "새 역할을 만들었습니다.",
      );
      setDrawerOpen(false);
      await reload();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setActionError({
        message: failure.message || "역할을 저장하지 못했습니다.",
        requestId: failure.requestId,
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeRole() {
    if (!selected || selected.isSystem || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/admin/roles?id=${encodeURIComponent(selected.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as ApiFailure;
      if (!response.ok) throw body;
      setSuccessMessage("역할을 삭제했습니다.");
      setDrawerOpen(false);
      await reload();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setActionError({
        message: failure.message || "역할을 삭제하지 못했습니다.",
        requestId: failure.requestId,
      });
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage
      title="역할 및 권한"
      description="팀 역할의 권한 범위를 관리합니다. 조직 관리자는 역할과 별도로 모든 권한을 유지합니다."
      action={
        <AdminButton
          variant="primary"
          onClick={openCreate}
          disabled={
            !selectedTeamId || !canManage || !data?.schemaReady || loading
          }
          title={!selectedTeamId ? "팀 범위를 먼저 선택해 주세요" : undefined}
        >
          <Plus size={14} /> 역할 추가
        </AdminButton>
      }
    >
      {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
      {!selectedTeamId && (
        <div className="mb-3 flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <p>
            조직 전체에서는 모든 역할을 조회합니다. 역할을 추가하거나 변경하려면
            왼쪽 상단에서 대상 팀을 선택해 주세요.
          </p>
        </div>
      )}
      {data && !data.schemaReady && (
        <div className="mb-3 flex gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-xs leading-5 text-red-800">
          <LockKeyhole className="mt-0.5 shrink-0" size={18} />
          <p>
            V32 역할·권한 마이그레이션 적용 전입니다. 현재 시스템 역할은 조회만
            가능하며 저장 기능은 비활성화됩니다.
          </p>
        </div>
      )}
      <label className="relative mb-3 block max-w-sm">
        <span className="sr-only">역할 검색</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          size={15}
        />
        <input
          className="admin-input admin-search-input w-full"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="역할 이름, 키, 팀 검색"
        />
      </label>

      {loading && <LoadingRows count={5} />}
      {error && (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={reload}
        />
      )}
      {!loading && !error && roles.length === 0 && (
        <EmptyState
          title="조건에 맞는 역할이 없습니다"
          description="검색어를 바꾸거나 팀 범위를 확인해 주세요."
        />
      )}
      {!loading && !error && roles.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="px-3 py-2.5 font-bold">역할</th>
                <th className="px-3 py-2.5 font-bold">적용 범위</th>
                <th className="px-3 py-2.5 text-right font-bold">권한</th>
                <th className="px-3 py-2.5 text-right font-bold">구성원</th>
                <th className="w-24 px-3 py-2.5 text-right font-bold">관리</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-t border-stone-100">
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => openRole(role)}
                    >
                      <span className="flex items-center gap-1.5">
                        <strong className="text-[13px] text-stone-900">
                          {role.name}
                        </strong>
                        {role.isSystem && (
                          <LockKeyhole size={12} className="text-stone-400" />
                        )}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] text-stone-400">
                        {role.key}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-stone-600">
                    {role.teamName}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {role.permissions.length}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {role.memberCount}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <AdminButton onClick={() => openRole(role)}>
                      {role.isSystem ? "보기" : "편집"}
                    </AdminButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminDrawer
        open={drawerOpen}
        title={selected ? selected.name : "새 역할"}
        onClose={closeDrawer}
      >
        <div className="space-y-5">
          <fieldset
            className="space-y-4"
            disabled={selected?.isSystem || saving}
          >
            <legend className="text-sm font-extrabold">역할 정보</legend>
            <RoleTextField
              label="역할 이름"
              value={draft.name}
              placeholder="예: 프로젝트 운영자"
              maxLength={40}
              onChange={(name) =>
                setDraft((current) => ({ ...current, name }))
              }
            />
            <RoleTextField
              label="역할 키"
              value={draft.key}
              placeholder="project_operator"
              maxLength={40}
              mono
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  key: value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                }))
              }
            />
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-stone-600">
                설명
              </span>
              <textarea
                className="admin-input min-h-24 w-full resize-y py-2"
                value={draft.description}
                maxLength={200}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
          </fieldset>

          <fieldset disabled={selected?.isSystem || saving}>
            <legend className="text-sm font-extrabold">권한</legend>
            <div className="mt-2 overflow-hidden rounded-md border border-stone-200">
              {(data?.permissions ?? []).map((permission) => {
                const enabled = draft.permissions.includes(permission.key);
                return (
                  <label
                    key={permission.key}
                    className="flex min-h-14 cursor-pointer items-center gap-3 border-t border-stone-100 px-3 first:border-t-0 hover:bg-stone-50"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-amber-500"
                      checked={enabled}
                      onChange={() => togglePermission(permission.key)}
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-xs text-stone-800">
                        {permission.name}
                      </strong>
                      <span className="font-mono text-[10px] text-stone-400">
                        {permission.key}
                      </span>
                    </span>
                    <span
                      className={`grid size-6 place-items-center rounded border ${enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-stone-200 bg-stone-50 text-stone-300"}`}
                    >
                      {enabled ? <Check size={13} /> : <Minus size={13} />}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {selected?.isSystem && (
            <div className="flex gap-2 rounded-md border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">
              <LockKeyhole className="mt-0.5 shrink-0" size={16} />
              시스템 역할은 호환성과 최소 관리자 보호를 위해 수정하거나 삭제할
              수 없습니다.
            </div>
          )}
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
          {discardPrompt ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-extrabold text-amber-950">
                저장하지 않은 변경사항이 있습니다
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <AdminButton onClick={() => setDiscardPrompt(false)}>
                  계속 편집
                </AdminButton>
                <AdminButton
                  variant="primary"
                  onClick={() => setDrawerOpen(false)}
                >
                  변경 버리기
                </AdminButton>
              </div>
            </div>
          ) : confirmDelete ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-4">
              <p className="text-sm font-extrabold text-red-900">
                이 역할을 삭제할까요?
              </p>
              <p className="mt-1 text-xs leading-5 text-red-700">
                구성원에게 배정된 역할은 삭제되지 않습니다.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <AdminButton onClick={() => setConfirmDelete(false)}>
                  취소
                </AdminButton>
                <AdminButton
                  variant="danger"
                  onClick={() => void removeRole()}
                  disabled={saving}
                >
                  {saving ? <SavingLabel label="삭제 중" /> : "삭제 확정"}
                </AdminButton>
              </div>
            </div>
          ) : !selected?.isSystem ? (
            <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 pt-4">
              {selected ? (
                <AdminButton
                  variant="ghost"
                  onClick={() => setConfirmDelete(true)}
                  disabled={!canManage || saving}
                >
                  <Trash2 size={14} /> 삭제
                </AdminButton>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <AdminButton onClick={closeDrawer} disabled={saving}>
                  취소
                </AdminButton>
                <AdminButton
                  variant="primary"
                  onClick={() => void saveRole()}
                  disabled={
                    !canManage ||
                    saving ||
                    !draft.name.trim() ||
                    !draft.key.trim()
                  }
                >
                  {saving ? (
                    <SavingLabel />
                  ) : (
                    <>
                      {selected ? <Pencil size={14} /> : <Save size={14} />}
                      저장
                    </>
                  )}
                </AdminButton>
              </div>
            </div>
          ) : null}
        </div>
      </AdminDrawer>
    </AdminPage>
  );
}

function RoleTextField({
  label,
  value,
  placeholder,
  maxLength,
  mono = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  maxLength: number;
  mono?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-stone-600">
        {label}
      </span>
      <input
        className={`admin-input w-full ${mono ? "font-mono" : ""}`}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
