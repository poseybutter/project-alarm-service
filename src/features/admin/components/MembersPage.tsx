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
// 사람 단위 묶음 — 팀 범위에서는 소속이 항상 1개
type MemberPerson = { email: string; name: string; memberships: AdminMember[] };

const membershipKey = (m: AdminMember) => m.membershipId ?? `legacy-${m.id}`;
const isRequestStage = (m: AdminMember) =>
  m.status === "pending" || m.status === "rejected" || !m.teamId;

export function MembersPage() {
  const { identity, scopes, selectedTeamId, selectedScope } = useAdmin();
  const isTeamScope = Boolean(selectedTeamId);
  const { data, error, loading, reload } =
    useAdminResource<MembersResponse>("/api/admin/members");
  const { data: roleCatalog } =
    useAdminResource<AdminRoleCatalog>("/api/admin/roles");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  // 편집 중인 소속 — 한 번에 하나만
  const [editingKey, setEditingKey] = useState<string | null>(null);
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
          scope.permissions.includes("members.manage") &&
          (!selectedTeamId || scope.teamId === selectedTeamId),
      ),
    [scopes, selectedTeamId],
  );
  const canManageTeam = (teamId: string | null) =>
    Boolean(teamId && teamOptions.some((s) => s.teamId === teamId));

  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addTeamId, setAddTeamId] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "member" | "viewer">(
    "member",
  );
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<ApiFailure | null>(null);

  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [removeError, setRemoveError] = useState<ApiFailure | null>(null);
  const [removingMembership, setRemovingMembership] = useState<AdminMember | null>(null);

  const people = useMemo(() => {
    const map = new Map<string, MemberPerson>();
    for (const m of data?.members ?? []) {
      const person = map.get(m.email);
      if (person) person.memberships.push(m);
      else map.set(m.email, { email: m.email, name: m.name, memberships: [m] });
    }
    return Array.from(map.values());
  }, [data]);

  const visiblePeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    return people.filter((person) => {
      // 조직 범위: 해당 상태의 소속이 하나라도 있으면 포함
      if (filter !== "all" && !person.memberships.some((m) => m.status === filter)) {
        return false;
      }
      if (!query) return true;
      return (
        person.name.toLowerCase().includes(query) ||
        person.email.toLowerCase().includes(query) ||
        person.memberships.some((m) => m.teamName.toLowerCase().includes(query))
      );
    });
  }, [people, filter, search]);

  const selected = useMemo(
    () => people.find((person) => person.email === selectedEmail) ?? null,
    [people, selectedEmail],
  );
  const isSelf = selected?.email === identity.email;
  const editTarget = useMemo(
    () => selected?.memberships.find((m) => membershipKey(m) === editingKey) ?? null,
    [selected, editingKey],
  );

  // 아직 소속되지 않은 팀 — 조직 범위에서만 계산 가능 (팀 범위는 다른 팀 소속을 불러오지 않음)
  const eligibleTeamsForSelected = useMemo(() => {
    if (!selected || isTeamScope) return [];
    const currentTeamIds = new Set(selected.memberships.map((m) => m.teamId));
    return teamOptions.filter((scope) => !currentTeamIds.has(scope.teamId));
  }, [selected, isTeamScope, teamOptions]);

  const addModalTeamOptions =
    selected && addEmail === selected.email ? eligibleTeamsForSelected : teamOptions;

  const dirty = Boolean(
    editTarget &&
    ((editTarget.roleId ?? `legacy:${editTarget.role}`) !== draftRoleId ||
      editTarget.status !== draftStatus),
  );

  function startEdit(target: AdminMember) {
    setEditingKey(membershipKey(target));
    setDraftRoleId(target.roleId ?? `legacy:${target.role}`);
    setDraftStatus(target.status === "suspended" ? "suspended" : "active");
    setSaveError(null);
  }

  function openPerson(person: MemberPerson) {
    setSelectedEmail(person.email);
    setEditingKey(null);
    setSaveError(null);
    setDiscardPrompt(false);
    setRemoveConfirm(false);
    setRemoveError(null);
    // 소속이 하나면 바로 편집 상태로 연다
    const [only] = person.memberships;
    if (
      person.memberships.length === 1 &&
      person.email !== identity.email &&
      canManageTeam(only.teamId) &&
      !isRequestStage(only)
    ) {
      startEdit(only);
    }
  }

  function closeDrawer() {
    if (saving || removeSaving) return;
    if (dirty) {
      setDiscardPrompt(true);
      return;
    }
    setSelectedEmail(null);
  }

  function openAddModal(email: string, teamIds: (string | null)[]) {
    setAddEmail(email);
    setAddTeamId(teamIds[0] ?? "");
    setAddRole("member");
    setAddError(null);
    setAddOpen(true);
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
      const teamLabel = teamOptions.find((s) => s.teamId === addTeamId)?.label ?? "팀";
      setSuccessMessage(`${addEmail.trim()}님을 ${teamLabel}에 추가했습니다.`);
      setAddOpen(false);
      setAddEmail("");
      await reload();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setAddError({
        message: failure.message || "팀에 추가하지 못했습니다.",
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
      if (membershipKey(removingMembership) === editingKey) setEditingKey(null);
      setRemovingMembership(null);
      // 팀 범위에서는 유일한 소속이 사라지므로 드로어를 닫는다
      if (isTeamScope) setSelectedEmail(null);
      await reload();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setRemoveConfirm(false);
      setRemovingMembership(null);
      setRemoveError({
        message: failure.message || "소속을 제거하지 못했습니다.",
        requestId: failure.requestId,
      });
    } finally {
      setRemoveSaving(false);
    }
  }

  async function saveMember() {
    if (!editTarget?.teamId || !dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 멤버십 단위 편집 — legacy players id(없으면 0)와 membershipId·teamId 를 함께 보낸다
          id: editTarget.id,
          ...(editTarget.membershipId ? { membershipId: editTarget.membershipId } : {}),
          teamId: editTarget.teamId,
          ...(roleCatalog?.schemaReady && !draftRoleId.startsWith("legacy:")
            ? { roleId: draftRoleId }
            : { role: draftRoleId === "legacy:admin" ? "admin" : "member" }),
          status: draftStatus,
        }),
      });
      const body = (await response.json()) as ApiFailure;
      if (!response.ok) throw body;
      setSuccessMessage(`${editTarget.name}님의 ${editTarget.teamName} 소속 역할과 상태를 저장했습니다.`);
      setEditingKey(null);
      if (isTeamScope) setSelectedEmail(null);
      await reload();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setSaveError({
        message: failure.message || "소속 정보를 저장하지 못했습니다.",
        requestId: failure.requestId,
      });
    } finally {
      setSaving(false);
    }
  }

  const filterLabels: Record<MemberFilter, string> = isTeamScope
    ? { all: "모든 상태", active: "활성", suspended: "정지", pending: "승인 대기" }
    : {
        all: "모든 상태",
        active: "활성 소속 있음",
        suspended: "정지된 소속 있음",
        pending: "승인 대기",
      };

  const inviteButton =
    teamOptions.length > 0 ? (
      <AdminButton
        variant="primary"
        onClick={() => openAddModal("", teamOptions.map((s) => s.teamId))}
      >
        <UserPlus size={14} /> 팀에 추가
      </AdminButton>
    ) : null;

  return (
    <AdminPage
      title={isTeamScope ? `구성원 관리 · ${selectedScope.label}` : "구성원 관리 · 조직 전체"}
      description={
        isTeamScope
          ? `${selectedScope.label} 소속 구성원입니다. 역할과 소속 상태는 이 팀에만 적용됩니다. 소속을 제거하는 대신 '정지'로 비활성화하는 것을 권장합니다.`
          : "조직 전체 구성원입니다. 이름을 클릭하면 팀별 소속·역할·상태를 확인하고 변경할 수 있습니다. 변경하려는 팀에 대한 구성원 관리 권한이 필요합니다."
      }
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
            placeholder={isTeamScope ? "이름, 이메일 검색" : "이름, 이메일, 팀 검색"}
          />
        </label>
        <label>
          <span className="sr-only">상태 필터</span>
          <select
            className="admin-select w-full sm:w-40"
            value={filter}
            onChange={(event) => setFilter(event.target.value as MemberFilter)}
          >
            {(Object.keys(filterLabels) as MemberFilter[]).map((key) => (
              <option key={key} value={key}>
                {filterLabels[key]}
              </option>
            ))}
          </select>
        </label>
        {inviteButton && <div className="sm:ml-auto">{inviteButton}</div>}
      </div>

      {loading && <LoadingRows count={7} />}
      {error && (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={reload}
        />
      )}
      {!loading && !error && people.length === 0 && (
        <div className="mt-6 text-center">
          <EmptyState
            title="등록된 구성원이 없습니다"
            description="가입한 사용자를 팀에 추가하여 시작하세요."
          />
          {inviteButton && <div className="mt-4">{inviteButton}</div>}
        </div>
      )}
      {!loading && !error && people.length > 0 && visiblePeople.length === 0 && (
        <EmptyState
          title="조건에 맞는 구성원이 없습니다"
          description="검색어 또는 상태 필터를 변경해 주세요."
        />
      )}
      {!loading && !error && visiblePeople.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead className="bg-stone-50 text-stone-500">
              {isTeamScope ? (
                <tr>
                  <th className="px-3 py-2.5 font-bold">구성원</th>
                  <th className="px-3 py-2.5 font-bold">역할</th>
                  <th className="px-3 py-2.5 font-bold">소속 상태</th>
                  <th className="px-3 py-2.5 text-right font-bold">레벨</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-3 py-2.5 font-bold">구성원</th>
                  <th className="px-3 py-2.5 font-bold">소속 팀 · 역할</th>
                </tr>
              )}
            </thead>
            <tbody>
              {visiblePeople.map((person) => (
                <tr
                  key={person.email}
                  className="border-t border-stone-100 cursor-pointer hover:bg-stone-50"
                  onClick={() => openPerson(person)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openPerson(person); }}
                >
                  <td className="px-3 py-3">
                    <PersonCell person={person} isSelf={person.email === identity.email} />
                  </td>
                  {isTeamScope ? (
                    <>
                      <td className="px-3 py-3">
                        <RoleChip label={person.memberships[0].roleName} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={person.memberships[0].status} />
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {person.memberships[0].level ?? "-"}
                      </td>
                    </>
                  ) : (
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {person.memberships.map((m) => (
                          <MembershipChip key={membershipKey(m)} membership={m} />
                        ))}
                      </div>
                    </td>
                  )}
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
                <p className="font-extrabold">
                  {selected.name}
                  {isSelf && <span className="ml-1 text-[10px] text-amber-700">나</span>}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-stone-500">
                  {selected.email}
                </p>
              </div>
            </div>

            {isSelf && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <ShieldAlert className="mt-0.5 shrink-0" size={16} />
                본인 소속의 역할과 상태는 직접 변경할 수 없습니다. 다른 관리자에게 요청해 주세요.
              </div>
            )}

            <div>
              <h3 className="mb-1 text-sm font-extrabold">
                {isTeamScope ? `${selectedScope.label} 소속` : "소속 팀"}
              </h3>
              <p className="mb-2 text-xs text-stone-500">
                역할과 소속 상태는 팀마다 따로 관리됩니다.{" "}
                <span className="font-bold">기본</span> 소속은 홈 화면·퀘스트 등에 사용되는 주 팀입니다.
              </p>
              <div className="divide-y divide-stone-100 rounded-md border border-stone-200">
                {selected.memberships.map((membership) => {
                  const key = membershipKey(membership);
                  const editable =
                    !isSelf && canManageTeam(membership.teamId) && !isRequestStage(membership);
                  const editing = key === editingKey;
                  return (
                    <div key={key} className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-700">
                          {membership.teamName}
                        </span>
                        {membership.isDefault && (
                          <span className="shrink-0 rounded border border-stone-200 bg-stone-100 px-1.5 text-[9px] font-extrabold text-stone-500">
                            기본
                          </span>
                        )}
                        <RoleChip label={membership.roleName} />
                        <StatusBadge status={membership.status} />
                        {editable && !editing && (
                          <button
                            type="button"
                            className="shrink-0 rounded px-1.5 py-1 text-[11px] font-bold text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
                            onClick={() => startEdit(membership)}
                            disabled={dirty || saving}
                          >
                            변경
                          </button>
                        )}
                        {editable && !membership.isDefault ? (
                          <button
                            type="button"
                            className="admin-icon-button shrink-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                            onClick={() => {
                              setRemovingMembership(membership);
                              setRemoveError(null);
                              setRemoveConfirm(true);
                            }}
                            disabled={removeSaving || saving}
                            aria-label={`${membership.teamName} 소속 제거`}
                          >
                            <UserMinus size={14} />
                          </button>
                        ) : (
                          <span className="w-[30px] shrink-0" />
                        )}
                      </div>
                      {isRequestStage(membership) && (
                        <p className="mt-1.5 text-[11px] leading-4 text-amber-800">
                          접근 요청 단계입니다. 접근 요청 화면에서 팀과 역할을 지정해 주세요.
                        </p>
                      )}
                      {!isSelf && !isRequestStage(membership) && !canManageTeam(membership.teamId) && (
                        <p className="mt-1.5 text-[11px] leading-4 text-stone-500">
                          이 팀의 구성원 관리 권한이 없습니다.
                        </p>
                      )}
                      {editing && (
                        <MembershipEditor
                          membership={membership}
                          roleCatalog={roleCatalog}
                          draftRoleId={draftRoleId}
                          draftStatus={draftStatus}
                          onRoleChange={setDraftRoleId}
                          onStatusChange={setDraftStatus}
                          saving={saving}
                          dirty={dirty}
                          onCancel={() => {
                            setEditingKey(null);
                            setSaveError(null);
                          }}
                          onSave={() => {
                            if (draftStatus === "suspended" && membership.status !== "suspended") {
                              setSuspendConfirm(true);
                            } else {
                              void saveMember();
                            }
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {eligibleTeamsForSelected.length > 0 && (
                <button
                  type="button"
                  className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-stone-300 px-3 py-2 text-xs font-semibold text-stone-500 hover:border-stone-400 hover:text-stone-700 transition-colors"
                  onClick={() =>
                    openAddModal(selected.email, eligibleTeamsForSelected.map((s) => s.teamId))
                  }
                >
                  <UserPlus size={13} /> 다른 팀에 추가
                </button>
              )}
              {removeError && (
                <ErrorBox failure={removeError} className="mt-2" />
              )}
            </div>

            {saveError && <ErrorBox failure={saveError} />}

            {discardPrompt && (
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
                    onClick={() => {
                      setDiscardPrompt(false);
                      setSelectedEmail(null);
                    }}
                  >
                    변경 버리기
                  </AdminButton>
                </div>
              </div>
            )}
          </div>
        )}
      </AdminDrawer>

      {editTarget && (
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
                  {editTarget.name}님의 {editTarget.teamName} 소속 정지
                </h2>
                <p className="mt-1 text-xs leading-5 text-stone-600">
                  {SUSPEND_NOTICE} 기존 데이터는 삭제되지 않으며, 언제든 활성
                  상태로 복구할 수 있습니다.
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
                    <Pause size={14} /> 소속 정지
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
                팀에 구성원 추가
              </h2>
              <p className="mt-1 text-xs leading-5 text-stone-600">
                한 번 이상 로그인한 사용자를 선택한 팀에 추가합니다. 다른 팀 소속은 그대로 유지됩니다.
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
                disabled={addSaving || addModalTeamOptions.length <= 1}
              >
                {addModalTeamOptions.map((scope) => (
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
          {addError && <ErrorBox failure={addError} className="mt-3" />}
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

// 소속이 하나뿐이면 동기화 트리거가 계정 상태까지 정지로 바꾼다 (V63 sync_legacy_player_identity)
const SUSPEND_NOTICE =
  "이 팀의 업무 데이터에 접근할 수 없게 됩니다. 다른 팀 소속에는 영향이 없지만, 활성 소속이 이 팀뿐이면 계정도 정지 상태가 됩니다.";

function PersonCell({ person, isSelf }: { person: MemberPerson; isSelf: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-8 shrink-0 place-items-center rounded bg-stone-100 font-bold text-stone-700">
        {person.name.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <strong className="block text-[13px] text-stone-900">
          {person.name}
          {isSelf && <span className="ml-1 text-[10px] text-amber-700">나</span>}
        </strong>
        <span className="block font-mono text-[10px] text-stone-500">
          {person.email}
        </span>
      </span>
    </div>
  );
}

function RoleChip({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-5 shrink-0 items-center rounded border border-stone-200 bg-stone-50 px-1.5 text-[10px] font-extrabold text-stone-700">
      {label}
    </span>
  );
}

function MembershipChip({ membership }: { membership: AdminMember }) {
  const inactive = membership.status !== "active";
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1 rounded border px-1.5 text-[11px] ${
        inactive
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-stone-200 bg-white text-stone-700"
      }`}
    >
      <span className="font-semibold">{membership.teamName}</span>
      {membership.isDefault && <span className="text-[9px] font-extrabold text-stone-400">기본</span>}
      <span className="text-stone-400">·</span>
      <span>{membership.roleName}</span>
      {inactive && <StatusBadge status={membership.status} />}
    </span>
  );
}

function MembershipEditor({
  membership,
  roleCatalog,
  draftRoleId,
  draftStatus,
  onRoleChange,
  onStatusChange,
  saving,
  dirty,
  onCancel,
  onSave,
}: {
  membership: AdminMember;
  roleCatalog: AdminRoleCatalog | null;
  draftRoleId: string;
  draftStatus: "active" | "suspended";
  onRoleChange: (roleId: string) => void;
  onStatusChange: (status: "active" | "suspended") => void;
  saving: boolean;
  dirty: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <fieldset className="mt-3 space-y-3 rounded-md border border-stone-200 bg-stone-50 p-3">
      <legend className="sr-only">{membership.teamName} 소속 역할과 상태</legend>
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-stone-600">
          {membership.teamName} 역할
        </span>
        <select
          className="admin-select w-full"
          value={draftRoleId}
          onChange={(event) => onRoleChange(event.target.value)}
          disabled={saving}
        >
          {roleCatalog?.schemaReady ? (
            roleCatalog.roles
              .filter(
                (role) =>
                  role.status === "active" &&
                  (role.teamId === null || role.teamId === membership.teamId),
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
          {membership.teamName} 소속 상태
        </span>
        <select
          className="admin-select w-full"
          value={draftStatus}
          onChange={(event) =>
            onStatusChange(event.target.value as "active" | "suspended")
          }
          disabled={saving}
        >
          <option value="active">활성</option>
          <option value="suspended">정지</option>
        </select>
      </label>
      {draftStatus === "suspended" && membership.status !== "suspended" && (
        <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
          <Pause className="mt-0.5 shrink-0" size={16} />
          {SUSPEND_NOTICE}
        </div>
      )}
      {draftStatus === "active" && membership.status === "suspended" && (
        <div className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
          <Play className="mt-0.5 shrink-0" size={16} />
          저장 즉시 이 팀 접근이 복구됩니다.
        </div>
      )}
      <div className="flex justify-end gap-2">
        <AdminButton onClick={onCancel} disabled={saving}>
          취소
        </AdminButton>
        <AdminButton variant="primary" onClick={onSave} disabled={!dirty || saving}>
          {saving ? (
            <SavingLabel />
          ) : (
            <>
              <Save size={14} /> 변경 저장
            </>
          )}
        </AdminButton>
      </div>
    </fieldset>
  );
}

function ErrorBox({ failure, className = "" }: { failure: ApiFailure; className?: string }) {
  return (
    <div
      role="alert"
      className={`rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800 ${className}`}
    >
      {failure.message}
      {failure.requestId && (
        <span className="mt-1 block font-mono text-[10px]">
          요청 ID: {failure.requestId}
        </span>
      )}
    </div>
  );
}