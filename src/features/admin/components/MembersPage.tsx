"use client";

import { useMemo, useState } from "react";
import {
  Pause,
  Play,
  Save,
  Search,
  ShieldAlert,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { useAdmin } from "@/features/admin/components/AdminShell";
import {
  AdminButton,
  AdminDrawer,
  AdminModal,
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingRows,
  SavingLabel,
  StatusBadge,
  SuccessMessage,
} from "@/features/admin/components/AdminUi";
import { useAdminResource } from "@/features/admin/hooks/useAdminResource";
import type {
  AdminMember,
  AdminRoleCatalog,
  ApiFailure,
} from "@/features/admin/types";

type MembersResponse = { members: AdminMember[] };
type MemberFilter = "all" | "active" | "suspended" | "pending";

export function MembersPage() {
  const { identity, scopes } = useAdmin();
  const { data, error, loading, reload } =
    useAdminResource<MembersResponse>("/api/admin/members");
  const { data: roleCatalog } =
    useAdminResource<AdminRoleCatalog>("/api/admin/roles");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [selected, setSelected] = useState<AdminMember | null>(null);
  const [draftRoleId, setDraftRoleId] = useState("legacy:member");
  const [draftStatus, setDraftStatus] = useState<"active" | "suspended">(
    "active",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiFailure | null>(null);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [suspendConfirm, setSuspendConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const teamOptions = useMemo(
    () =>
      scopes.filter(
        (scope) =>
          scope.kind === "team" &&
          scope.permissions.includes("members.manage"),
      ),
    [scopes],
  );
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addTeamId, setAddTeamId] = useState(teamOptions[0]?.teamId ?? "");
  const [addRole, setAddRole] = useState<"admin" | "member" | "viewer">(
    "member",
  );
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<ApiFailure | null>(null);

  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [removeError, setRemoveError] = useState<ApiFailure | null>(null);
  const [removingMembership, setRemovingMembership] = useState<AdminMember | null>(null);

  const members = useMemo(() => {
    const query = search.trim().toLowerCase();
    // 사람 기준으로 중복 제거 — 기본 소속(isDefault=true)을 우선, 없으면 첫 번째 행 사용
    const seen = new Map<string, AdminMember>();
    for (const member of data?.members ?? []) {
      const existing = seen.get(member.email);
      if (!existing || (!existing.isDefault && member.isDefault)) {
        seen.set(member.email, member);
      }
    }
    return Array.from(seen.values()).filter((member) => {
      if (filter !== "all" && member.status !== filter) return false;
      return (
        !query ||
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        member.teamName.toLowerCase().includes(query)
      );
    });
  }, [data, filter, search]);

  const teamNamesByEmail = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of data?.members ?? []) {
      const list = map.get(m.email) ?? [];
      map.set(m.email, [...list, m.teamName]);
    }
    return map;
  }, [data]);

  const allMembershipsForSelected = useMemo(
    () => (selected ? (data?.members ?? []).filter((m) => m.email === selected.email) : []),
    [data, selected],
  );
  const selectedPrimary = useMemo(
    () => allMembershipsForSelected.find((m) => m.isDefault) ?? selected,
    [allMembershipsForSelected, selected],
  );

  const dirty = Boolean(
    selectedPrimary &&
    ((selectedPrimary.roleId ?? `legacy:${selectedPrimary.role}`) !== draftRoleId ||
      selectedPrimary.status !== draftStatus),
  );

  function openMember(member: AdminMember) {
    setSelected(member);
    // find the primary membership for this user to initialize drafts
    const primary = (data?.members ?? []).find((m) => m.email === member.email && m.isDefault) ?? member;
    setDraftRoleId(primary.roleId ?? `legacy:${primary.role}`);
    setDraftStatus(primary.status === "suspended" ? "suspended" : "active");
    setSaveError(null);
    setDiscardPrompt(false);
    setRemoveConfirm(false);
    setRemoveError(null);
  }

  function closeDrawer() {
    if (saving || removeSaving) return;
    if (dirty) {
      setDiscardPrompt(true);
      return;
    }
    setSelected(null);
  }

  async function submitAddMembership() {
    if (!addEmail.trim() || !addTeamId || addSaving) return;
    setAddSaving(true);
    setAddError(null);
    try {
      const response = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addEmail.trim(),
          teamId: addTeamId,
          role: addRole,
        }),
      });
      const body = (await response.json()) as ApiFailure;
      if (!response.ok) throw body;
      setSuccessMessage(`${addEmail.trim()}님을 팀에 추가했습니다.`);
      setAddOpen(false);
      setAddEmail("");
      await reload();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setAddError({
        message: failure.message || "멤버십을 추가하지 못했습니다.",
        requestId: failure.requestId,
      });
    } finally {
      setAddSaving(false);
    }
  }

  async function removeMembership() {
    if (!removingMembership?.membershipId || !removingMembership.teamId || removeSaving) return;
    setRemoveSaving(true);
    setRemoveError(null);
    try {
      const response = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: removingMembership.membershipId,
          teamId: removingMembership.teamId,
        }),
      });
      if (response.status !== 204) {
        throw (await response.json()) as ApiFailure;
      }
      setSuccessMessage(`${removingMembership.name}님의 ${removingMembership.teamName} 소속을 제거했습니다.`);
      setRemoveConfirm(false);
      setRemovingMembership(null);
      await reload();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setRemoveError({
        message: failure.message || "소속을 제거하지 못했습니다.",
        requestId: failure.requestId,
      });
    } finally {
      setRemoveSaving(false);
    }
  }

  async function saveMember() {
    if (!selectedPrimary?.teamId || !dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPrimary.id,
          teamId: selectedPrimary.teamId,
          ...(roleCatalog?.schemaReady && !draftRoleId.startsWith("legacy:")
            ? { roleId: draftRoleId }
            : { role: draftRoleId === "legacy:admin" ? "admin" : "member" }),
          status: draftStatus,
        }),
      });
      const body = (await response.json()) as ApiFailure;
      if (!response.ok) throw body;
      setSuccessMessage(`${selectedPrimary.name}님의 권한과 상태를 저장했습니다.`);
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
            className="admin-input admin-search-input w-full"
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
        {teamOptions.length > 0 && (
          <AdminButton
            variant="primary"
            className="sm:ml-auto"
            onClick={() => {
              setAddEmail("");
              setAddTeamId(teamOptions[0]?.teamId ?? "");
              setAddRole("member");
              setAddError(null);
              setAddOpen(true);
            }}
          >
            <UserPlus size={14} /> 구성원 초대
          </AdminButton>
        )}
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
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.membershipId ?? `legacy-${member.id}`}
                  className="border-t border-stone-100 cursor-pointer hover:bg-stone-50"
                  onClick={() => openMember(member)}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
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
                    </div>
                  </td>
                  <td className="px-3 py-3 text-stone-600">
                    {(teamNamesByEmail.get(member.email) ?? [member.teamName]).join(", ")}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex min-h-5 items-center rounded border border-stone-200 bg-stone-50 px-1.5 text-[10px] font-extrabold text-stone-700">
                      {member.roleName}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={member.status} />
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {member.level ?? "-"}
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
            {/* Header */}
            <div className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded bg-amber-100 text-base font-black text-amber-800">
                {selected.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-extrabold">{selected.name}</p>
                  <StatusBadge status={selectedPrimary?.status ?? selected.status} />
                </div>
                <p className="mt-1 break-all font-mono text-xs text-stone-500">
                  {selected.email}
                </p>
              </div>
            </div>

            {/* Pending/Rejected state */}
            {(selectedPrimary?.status === "pending" ||
              selectedPrimary?.status === "rejected" ||
              !selectedPrimary?.teamId) ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                이 사용자는 접근 요청 단계에 있습니다. 접근 요청 화면에서 팀과 역할을 지정해 주세요.
              </div>
            ) : (
              <>
                {/* 소속 팀 section */}
                <div>
                  <h3 className="mb-2 text-sm font-extrabold">소속 팀</h3>
                  <div className="divide-y divide-stone-100 rounded-md border border-stone-200">
                    {allMembershipsForSelected.map((membership) => (
                      <div
                        key={membership.membershipId ?? `legacy-${membership.id}`}
                        className="flex items-center gap-2 px-3 py-2.5"
                      >
                        <span className="min-w-0 flex-1 text-sm font-medium text-stone-700 truncate">
                          {membership.teamName}
                        </span>
                        {membership.isDefault && (
                          <span className="shrink-0 rounded border border-stone-200 bg-stone-100 px-1.5 text-[9px] font-extrabold text-stone-500">
                            기본
                          </span>
                        )}
                        <span className="shrink-0 inline-flex min-h-5 items-center rounded border border-stone-200 bg-stone-50 px-1.5 text-[10px] font-extrabold text-stone-700">
                          {membership.roleName}
                        </span>
                        {!membership.isDefault && membership.email !== identity.email ? (
                          <button
                            type="button"
                            className="admin-icon-button shrink-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                            onClick={() => {
                              setRemovingMembership(membership);
                              setRemoveError(null);
                              setRemoveConfirm(true);
                            }}
                            disabled={removeSaving}
                            aria-label={`${membership.teamName} 소속 제거`}
                          >
                            <UserMinus size={14} />
                          </button>
                        ) : (
                          <span className="w-[30px] shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                  {teamOptions.length > 0 && (
                    <button
                      type="button"
                      className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-stone-300 px-3 py-2 text-xs font-semibold text-stone-500 hover:border-stone-400 hover:text-stone-700 transition-colors"
                      onClick={() => {
                        setAddEmail(selected.email);
                        setAddTeamId(teamOptions[0]?.teamId ?? "");
                        setAddRole("member");
                        setAddError(null);
                        setAddOpen(true);
                      }}
                    >
                      <UserPlus size={13} /> 다른 팀에 추가
                    </button>
                  )}
                  {removeError && (
                    <div
                      role="alert"
                      className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"
                    >
                      {removeError.message}
                      {removeError.requestId && (
                        <span className="mt-1 block font-mono text-[10px]">
                          요청 ID: {removeError.requestId}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Role & Status editing — primary membership only */}
                {selectedPrimary?.isDefault && (
                  <fieldset className="space-y-4">
                    <legend className="text-sm font-extrabold">권한 및 상태</legend>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-stone-600">
                        팀 역할
                      </span>
                      <select
                        className="admin-select w-full"
                        value={draftRoleId}
                        onChange={(event) => setDraftRoleId(event.target.value)}
                        disabled={selected.email === identity.email}
                      >
                        {roleCatalog?.schemaReady ? (
                          roleCatalog.roles
                            .filter(
                              (role) =>
                                role.status === "active" &&
                                (role.teamId === null ||
                                  role.teamId === selectedPrimary.teamId),
                            )
                            .map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                                {role.teamId ? " · 팀 전용" : ""}
                              </option>
                            ))
                        ) : (
                          <>
                            <option value="legacy:member">구성원</option>
                            <option value="legacy:admin">팀 관리자</option>
                          </>
                        )}
                      </select>
                      {roleCatalog?.schemaReady && (
                        <span className="mt-1.5 block text-[11px] leading-4 text-stone-500">
                          역할별 세부 권한은 역할 및 권한 화면에서 관리합니다.
                        </span>
                      )}
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-stone-600">
                        계정 상태
                      </span>
                      <select
                        className="admin-select w-full"
                        value={draftStatus}
                        onChange={(event) =>
                          setDraftStatus(event.target.value as "active" | "suspended")
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
                    {draftStatus === "suspended" && selectedPrimary.status !== "suspended" && (
                      <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
                        <Pause className="mt-0.5 shrink-0" size={16} />
                        정지하면 이 사용자는 로그인 후 업무 데이터에 접근할 수 없습니다. 기존 데이터는 삭제되지 않습니다.
                      </div>
                    )}
                    {draftStatus === "active" && selectedPrimary.status === "suspended" && (
                      <div className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                        <Play className="mt-0.5 shrink-0" size={16} />
                        저장 즉시 계정 접근이 복구됩니다.
                      </div>
                    )}
                  </fieldset>
                )}
              </>
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
                  <AdminButton variant="primary" onClick={() => setSelected(null)}>
                    변경 버리기
                  </AdminButton>
                </div>
              </div>
            ) : selectedPrimary?.isDefault &&
              selectedPrimary.status !== "pending" &&
              selectedPrimary.status !== "rejected" ? (
              <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
                <AdminButton onClick={closeDrawer} disabled={saving}>
                  취소
                </AdminButton>
                <AdminButton
                  variant="primary"
                  onClick={() => {
                    if (draftStatus === "suspended" && selectedPrimary.status !== "suspended") {
                      setSuspendConfirm(true);
                    } else {
                      void saveMember();
                    }
                  }}
                  disabled={!dirty || saving || selected.email === identity.email}
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

      {selected && (
        <AdminModal
          open={suspendConfirm}
          role="alertdialog"
          labelledBy="suspend-member-title"
          onClose={() => !saving && setSuspendConfirm(false)}
          className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-md border-2 border-stone-950 bg-white shadow-2xl"
        >
          <div className="relative p-5">
            <button
              type="button"
              className="admin-icon-button absolute right-3 top-3"
              aria-label="닫기"
              onClick={() => setSuspendConfirm(false)}
              disabled={saving}
            >
              <X size={18} />
            </button>
            <div className="flex gap-3 pr-9">
              <span className="grid size-9 shrink-0 place-items-center rounded bg-amber-100 text-amber-700">
                <Pause size={18} />
              </span>
              <div>
                <h2 id="suspend-member-title" className="text-base font-extrabold">
                  {selected.name} 계정 정지
                </h2>
                <p className="mt-1 text-xs leading-5 text-stone-600">
                  정지하면 이 사용자는 즉시 로그인 후 업무 데이터에 접근할 수
                  없습니다. 기존 데이터는 삭제되지 않으며, 언제든 활성 상태로
                  복구할 수 있습니다.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-stone-200 pt-4">
              <AdminButton
                onClick={() => setSuspendConfirm(false)}
                disabled={saving}
              >
                취소
              </AdminButton>
              <AdminButton
                variant="danger"
                onClick={() => {
                  setSuspendConfirm(false);
                  void saveMember();
                }}
                disabled={saving}
              >
                {saving ? (
                  <SavingLabel label="정지 중" />
                ) : (
                  <>
                    <Pause size={14} /> 계정 정지
                  </>
                )}
              </AdminButton>
            </div>
          </div>
        </AdminModal>
      )}

      {removingMembership && (
        <AdminModal
          open={removeConfirm}
          role="alertdialog"
          labelledBy="remove-membership-title"
          onClose={() => {
            if (!removeSaving) {
              setRemoveConfirm(false);
              setRemovingMembership(null);
            }
          }}
          className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-md border-2 border-stone-950 bg-white shadow-2xl"
        >
          <div className="relative p-5">
            <button
              type="button"
              className="admin-icon-button absolute right-3 top-3"
              aria-label="닫기"
              onClick={() => {
                setRemoveConfirm(false);
                setRemovingMembership(null);
              }}
              disabled={removeSaving}
            >
              <X size={18} />
            </button>
            <div className="flex gap-3 pr-9">
              <span className="grid size-9 shrink-0 place-items-center rounded bg-red-100 text-red-700">
                <UserMinus size={18} />
              </span>
              <div>
                <h2
                  id="remove-membership-title"
                  className="text-base font-extrabold"
                >
                  {removingMembership.teamName} 소속 제거
                </h2>
                <p className="mt-1 text-xs leading-5 text-stone-600">
                  {removingMembership.name}님을 {removingMembership.teamName}에서 제거합니다. 다른
                  팀 소속에는 영향이 없고, 필요하면 언제든 다시 추가할 수
                  있습니다.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-stone-200 pt-4">
              <AdminButton
                onClick={() => {
                  setRemoveConfirm(false);
                  setRemovingMembership(null);
                }}
                disabled={removeSaving}
              >
                취소
              </AdminButton>
              <AdminButton
                variant="danger"
                onClick={() => void removeMembership()}
                disabled={removeSaving}
              >
                {removeSaving ? (
                  <SavingLabel label="제거 중" />
                ) : (
                  <>
                    <UserMinus size={14} /> 소속 제거
                  </>
                )}
              </AdminButton>
            </div>
          </div>
        </AdminModal>
      )}

      <AdminModal
        open={addOpen}
        role="dialog"
        labelledBy="add-membership-title"
        onClose={() => !addSaving && setAddOpen(false)}
        className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-md border-2 border-stone-950 bg-white shadow-2xl"
      >
        <div className="relative p-5">
          <button
            type="button"
            className="admin-icon-button absolute right-3 top-3"
            aria-label="닫기"
            onClick={() => setAddOpen(false)}
            disabled={addSaving}
          >
            <X size={18} />
          </button>
          <div className="flex gap-3 pr-9">
            <span className="grid size-9 shrink-0 place-items-center rounded bg-amber-100 text-amber-700">
              <UserPlus size={18} />
            </span>
            <div>
              <h2 id="add-membership-title" className="text-base font-extrabold">
                구성원 초대
              </h2>
              <p className="mt-1 text-xs leading-5 text-stone-600">
                이미 가입한 구성원을 다른 팀에 추가합니다. 기존 소속은 그대로 유지되고, 선택한 팀에 소속이 생깁니다.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-stone-600">
                이메일
              </span>
              <input
                className="admin-input w-full"
                type="email"
                value={addEmail}
                onChange={(event) => setAddEmail(event.target.value)}
                placeholder="member@example.com"
                disabled={addSaving}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-stone-600">
                추가할 팀
              </span>
              <select
                className="admin-select w-full"
                value={addTeamId}
                onChange={(event) => setAddTeamId(event.target.value)}
                disabled={addSaving}
              >
                {teamOptions.map((scope) => (
                  <option key={scope.teamId} value={scope.teamId ?? ""}>
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
                value={addRole}
                onChange={(event) =>
                  setAddRole(event.target.value as "admin" | "member" | "viewer")
                }
                disabled={addSaving}
              >
                <option value="member">구성원</option>
                <option value="admin">팀 관리자</option>
                <option value="viewer">뷰어</option>
              </select>
            </label>
          </div>
          {addError && (
            <div
              role="alert"
              className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"
            >
              {addError.message}
              {addError.requestId && (
                <span className="mt-1 block font-mono text-[10px]">
                  요청 ID: {addError.requestId}
                </span>
              )}
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2 border-t border-stone-200 pt-4">
            <AdminButton onClick={() => setAddOpen(false)} disabled={addSaving}>
              취소
            </AdminButton>
            <AdminButton
              variant="primary"
              onClick={() => void submitAddMembership()}
              disabled={addSaving || !addEmail.trim() || !addTeamId}
            >
              {addSaving ? (
                <SavingLabel label="추가 중" />
              ) : (
                <>
                  <UserPlus size={14} /> 추가
                </>
              )}
            </AdminButton>
          </div>
        </div>
      </AdminModal>
    </AdminPage>
  );
}
