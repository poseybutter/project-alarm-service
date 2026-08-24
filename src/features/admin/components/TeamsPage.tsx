"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Blocks,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  ShieldAlert,
  ShieldMinus,
  Trash2,
  Users,
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
  SuccessMessage,
} from "@/features/admin/components/AdminUi";
import { useAdminResource } from "@/features/admin/hooks/useAdminResource";
import type {
  AdminMember,
  AdminTeam,
  ApiFailure,
} from "@/features/admin/types";
import { TEAM_ID } from "@/lib/constants";

type TeamsResponse = { teams: AdminTeam[] };
type MembersResponse = { members: AdminMember[] };
type TeamFilter = "all" | "active" | "archived";

export function TeamsPage() {
  const router = useRouter();
  const { identity } = useAdmin();
  const { data, error, loading, reload } =
    useAdminResource<TeamsResponse>("/api/admin/teams");
  const {
    data: membersData,
    error: membersError,
    loading: membersLoading,
    reload: reloadMembers,
  } = useAdminResource<MembersResponse>("/api/admin/members");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TeamFilter>("all");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AdminTeam | null>(null);
  const [teamId, setTeamId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiFailure | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [managerCandidateId, setManagerCandidateId] = useState("");
  const [roleSavingId, setRoleSavingId] = useState<number | null>(null);
  const [roleMessage, setRoleMessage] = useState<string | null>(null);

  const teams = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.teams ?? []).filter((team) => {
      if (filter !== "all" && team.status !== filter) return false;
      return (
        !query ||
        team.name.toLowerCase().includes(query) ||
        team.id.toLowerCase().includes(query) ||
        team.description?.toLowerCase().includes(query)
      );
    });
  }, [data, filter, search]);

  const dirty = Boolean(
    selected &&
      (draftName.trim() !== selected.name ||
        draftDescription.trim() !== (selected.description ?? "")),
  );
  const selectedTeamMembers = (membersData?.members ?? []).filter(
    (member) =>
      member.teamId === selected?.id && member.status === "active",
  );
  const selectedTeamAdmins = selectedTeamMembers.filter(
    (member) => member.role === "admin",
  );
  const managerCandidates = selectedTeamMembers.filter(
    (member) => member.role !== "admin",
  );

  function resetFeedback() {
    setSaveError(null);
    setDiscardPrompt(false);
    setDeletePrompt(false);
    setDeleteConfirmation("");
    setManagerCandidateId("");
    setRoleMessage(null);
  }

  function openCreateDrawer() {
    resetFeedback();
    setTeamId("");
    setName("");
    setDescription("");
    setCreating(true);
  }

  function openTeam(team: AdminTeam) {
    resetFeedback();
    setSelected(team);
    setDraftName(team.name);
    setDraftDescription(team.description ?? "");
  }

  function closeTeamDrawer() {
    if (saving) return;
    if (dirty) {
      setDiscardPrompt(true);
      return;
    }
    setSelected(null);
    resetFeedback();
  }

  async function readFailure(response: Response) {
    return (await response.json()) as ApiFailure;
  }

  async function refreshTeamViews() {
    await Promise.all([reload(), reloadMembers()]);
    router.refresh();
  }

  async function createTeam() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: teamId, name, description }),
      });
      if (!response.ok) throw await readFailure(response);
      setSuccessMessage(`${name.trim()}을 생성했습니다.`);
      setCreating(false);
      setTeamId("");
      setName("");
      setDescription("");
      await refreshTeamViews();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setSaveError({
        message: failure.message || "팀을 만들지 못했습니다.",
        requestId: failure.requestId,
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateTeam(status = selected?.status) {
    if (!selected || !status || saving) return;
    setSaving(true);
    setSaveError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          name: draftName,
          description: draftDescription,
          status,
        }),
      });
      if (!response.ok) throw await readFailure(response);
      const message =
        status !== selected.status
          ? status === "archived"
            ? `${selected.name}을 보관했습니다.`
            : `${selected.name}을 복원했습니다.`
          : `${draftName.trim()} 정보를 저장했습니다.`;
      setSuccessMessage(message);
      setSelected(null);
      resetFeedback();
      await refreshTeamViews();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setSaveError({
        message: failure.message || "팀 정보를 변경하지 못했습니다.",
        requestId: failure.requestId,
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam() {
    if (
      !selected ||
      saving ||
      deleteConfirmation.trim() !== selected.name
    ) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/teams", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id }),
      });
      if (!response.ok) throw await readFailure(response);
      setSuccessMessage(`${selected.name}을 영구 삭제했습니다.`);
      setSelected(null);
      resetFeedback();
      await refreshTeamViews();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setDeletePrompt(false);
      setDeleteConfirmation("");
      setSaveError({
        message: failure.message || "팀을 삭제하지 못했습니다.",
        requestId: failure.requestId,
      });
    } finally {
      setSaving(false);
    }
  }

  async function changeTeamManager(member: AdminMember, makeAdmin: boolean) {
    if (!selected || roleSavingId !== null) return;
    setRoleSavingId(member.id);
    setSaveError(null);
    setRoleMessage(null);
    try {
      const response = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: member.id,
          teamId: selected.id,
          role: makeAdmin ? "admin" : "member",
        }),
      });
      if (!response.ok) throw await readFailure(response);
      setSelected((current) =>
        current
          ? {
              ...current,
              adminCount: Math.max(
                0,
                current.adminCount + (makeAdmin ? 1 : -1),
              ),
            }
          : current,
      );
      setManagerCandidateId("");
      setRoleMessage(
        makeAdmin
          ? `${member.name}님을 팀 관리자로 지정했습니다.`
          : `${member.name}님의 팀 관리자 권한을 해제했습니다.`,
      );
      await refreshTeamViews();
    } catch (reason) {
      const failure = reason as ApiFailure;
      setSaveError({
        message: failure.message || "팀 관리자 역할을 변경하지 못했습니다.",
        requestId: failure.requestId,
      });
    } finally {
      setRoleSavingId(null);
    }
  }

  return (
    <AdminPage
      title="팀 관리"
      description="직군과 협업 단위별 팀을 생성하고 운영 상태를 관리합니다. 연결 데이터가 있는 팀은 보관해 이력을 유지합니다."
      action={
        identity.isOrganizationAdmin ? (
          <AdminButton variant="primary" onClick={openCreateDrawer}>
            <Plus size={14} /> 팀 생성
          </AdminButton>
        ) : undefined
      }
    >
      {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">팀 검색</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            size={15}
          />
          <input
            className="admin-input admin-search-input w-full"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="팀 이름, ID, 설명 검색"
          />
        </label>
        <label>
          <span className="sr-only">팀 상태 필터</span>
          <select
            className="admin-select w-full sm:w-32"
            value={filter}
            onChange={(event) => setFilter(event.target.value as TeamFilter)}
          >
            <option value="all">모든 상태</option>
            <option value="active">운영 중</option>
            <option value="archived">보관</option>
          </select>
        </label>
      </div>

      {loading && <LoadingRows count={4} />}
      {error && (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={reload}
        />
      )}
      {!loading && !error && teams.length === 0 && (
        <EmptyState
          title={data?.teams.length ? "조건에 맞는 팀이 없습니다" : "등록된 팀이 없습니다"}
          description={
            data?.teams.length
              ? "검색어나 상태 필터를 변경해 주세요."
              : "첫 팀을 만든 뒤 구성원을 배정해 주세요."
          }
        />
      )}
      {!loading && !error && teams.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <article
              key={team.id}
              className={`rounded-md border bg-white p-4 ${
                team.status === "archived"
                  ? "border-stone-200 bg-stone-50/70"
                  : "border-stone-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded border border-stone-200 bg-stone-50 text-stone-600">
                  <Blocks size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-extrabold">{team.name}</h3>
                    {team.id === TEAM_ID && (
                      <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        기본 운영팀
                      </span>
                    )}
                    {team.status === "archived" && (
                      <span className="rounded border border-stone-200 bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">
                        보관
                      </span>
                    )}
                    {team.status === "active" && (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        운영 중
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-stone-400">
                    {team.id}
                  </p>
                </div>
                <AdminButton
                  variant="ghost"
                  className="min-h-8 px-2"
                  onClick={() => openTeam(team)}
                >
                  <Pencil size={13} /> {identity.isOrganizationAdmin ? "관리" : "상세"}
                </AdminButton>
              </div>
              <p className="mt-3 min-h-10 text-xs leading-5 text-stone-500">
                {team.description || "설명 없음"}
              </p>
              <dl className="mt-3 grid grid-cols-3 border-t border-stone-100 pt-3 text-center">
                <Stat label="활성 인원" value={team.memberCount} />
                <Stat label="관리자" value={team.adminCount} />
                <Stat label="프로젝트" value={team.projectCount} />
              </dl>
              {team.status === "active" && team.adminCount === 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-bold text-amber-900">
                  <Users size={14} /> 팀 관리자를 지정해 주세요.
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <AdminDrawer
        open={creating}
        title="새 팀 생성"
        onClose={() => !saving && setCreating(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void createTeam();
          }}
        >
          <TeamNameField value={name} onChange={setName} />
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-stone-600">
              팀 ID
            </span>
            <input
              className="admin-input w-full font-mono"
              value={teamId}
              onChange={(event) =>
                setTeamId(
                  event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                )
              }
              minLength={2}
              maxLength={31}
              required
              pattern="[a-z0-9][a-z0-9-]+"
              placeholder="design"
            />
            <span className="mt-1.5 block text-[11px] leading-4 text-stone-500">
              업무 데이터의 소속 키로 사용되며 생성 후 변경할 수 없습니다.
            </span>
          </label>
          <TeamDescriptionField value={description} onChange={setDescription} />
          <RequestError error={saveError} />
          <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
            <AdminButton onClick={() => setCreating(false)} disabled={saving}>
              취소
            </AdminButton>
            <AdminButton
              type="submit"
              variant="primary"
              disabled={saving || name.trim().length < 2 || teamId.length < 2}
            >
              {saving ? (
                <SavingLabel label="생성 중" />
              ) : (
                <>
                  <Save size={14} /> 팀 생성
                </>
              )}
            </AdminButton>
          </div>
        </form>
      </AdminDrawer>

      <AdminDrawer
        open={Boolean(selected)}
        title={identity.isOrganizationAdmin ? "팀 상세 및 관리" : "팀 상세"}
        onClose={closeTeamDrawer}
      >
        {selected && (
          <div className="space-y-5">
            <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{selected.name}</strong>
                <span className="font-mono text-[10px] text-stone-500">
                  {selected.id}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 border-t border-stone-200 pt-3 text-center">
                <Stat label="활성 인원" value={selected.memberCount} />
                <Stat label="관리자" value={selected.adminCount} />
                <Stat label="프로젝트" value={selected.projectCount} />
              </dl>
            </div>

            <section aria-labelledby="team-managers-title">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-amber-700" size={17} />
                <h3 id="team-managers-title" className="text-sm font-extrabold">
                  팀 관리자
                </h3>
                <span className="rounded border border-stone-200 bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-stone-600">
                  {selectedTeamAdmins.length}명
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                팀 관리자는 해당 팀의 접근 요청, 구성원 역할과 운영 정보를 관리할
                수 있습니다.
              </p>

              {membersLoading ? (
                <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-4 text-center text-xs text-stone-500">
                  구성원을 불러오는 중입니다.
                </div>
              ) : membersError ? (
                <div className="mt-3">
                  <RequestError error={membersError} />
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {selectedTeamAdmins.length === 0 ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                      지정된 팀 관리자가 없습니다. 아래에서 활성 구성원을 관리자로
                      지정해 주세요.
                    </div>
                  ) : (
                    selectedTeamAdmins.map((member) => {
                      const isSelf = member.email === identity.email;
                      const isLastAdmin = selectedTeamAdmins.length <= 1;
                      return (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 rounded-md border border-stone-200 bg-white p-3"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded bg-amber-100 text-xs font-black text-amber-800">
                            {member.name.slice(0, 1)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-xs">
                              {member.name}
                              {isSelf && (
                                <span className="ml-1 text-[10px] text-amber-700">
                                  나
                                </span>
                              )}
                            </strong>
                            <span className="block truncate font-mono text-[10px] text-stone-500">
                              {member.email}
                            </span>
                          </span>
                          <AdminButton
                            variant="ghost"
                            className="min-h-8 shrink-0 px-2 text-red-700"
                            onClick={() =>
                              void changeTeamManager(member, false)
                            }
                            disabled={
                              roleSavingId !== null || isSelf || isLastAdmin
                            }
                            title={
                              isSelf
                                ? "자신의 관리자 권한은 직접 해제할 수 없습니다."
                                : isLastAdmin
                                  ? "팀의 마지막 관리자는 해제할 수 없습니다."
                                  : "팀 관리자 권한 해제"
                            }
                          >
                            {roleSavingId === member.id ? (
                              <SavingLabel label="변경 중" />
                            ) : (
                              <>
                                <ShieldMinus size={14} /> 권한 해제
                              </>
                            )}
                          </AdminButton>
                        </div>
                      );
                    })
                  )}

                  {managerCandidates.length > 0 ? (
                    <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-bold text-stone-600">
                          관리자 추가
                        </span>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select
                            className="admin-select min-w-0 flex-1"
                            value={managerCandidateId}
                            onChange={(event) =>
                              setManagerCandidateId(event.target.value)
                            }
                            disabled={roleSavingId !== null}
                          >
                            <option value="">활성 구성원 선택</option>
                            {managerCandidates.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name} · {member.email}
                              </option>
                            ))}
                          </select>
                          <AdminButton
                            variant="primary"
                            disabled={
                              !managerCandidateId || roleSavingId !== null
                            }
                            onClick={() => {
                              const candidate = managerCandidates.find(
                                (member) =>
                                  String(member.id) === managerCandidateId,
                              );
                              if (candidate)
                                void changeTeamManager(candidate, true);
                            }}
                          >
                            <ShieldCheck size={14} /> 관리자 지정
                          </AdminButton>
                        </div>
                      </label>
                    </div>
                  ) : selectedTeamMembers.length === 0 ? (
                    <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">
                      이 팀에 배정된 활성 구성원이 없습니다. 접근 요청을 승인할 때
                      이 팀을 배정하면 관리자 후보로 표시됩니다.
                    </div>
                  ) : (
                    <p className="px-1 text-[11px] leading-5 text-stone-500">
                      추가로 지정할 수 있는 활성 구성원이 없습니다.
                    </p>
                  )}
                </div>
              )}

              {roleMessage && (
                <div
                  role="status"
                  className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-800"
                >
                  {roleMessage}
                </div>
              )}
            </section>

            {identity.isOrganizationAdmin ? (
              <fieldset className="space-y-4" disabled={saving}>
                <legend className="text-sm font-extrabold">기본 정보</legend>
                <TeamNameField value={draftName} onChange={setDraftName} />
                <TeamDescriptionField
                  value={draftDescription}
                  onChange={setDraftDescription}
                />
              </fieldset>
            ) : (
              <div>
                <p className="text-xs font-bold text-stone-500">설명</p>
                <p className="mt-1 text-sm leading-6 text-stone-800">
                  {selected.description || "설명 없음"}
                </p>
              </div>
            )}

            {selected.id === TEAM_ID && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <ShieldAlert className="mt-0.5 shrink-0" size={16} />
                <span>
                  기존 업무·리포트 기능이 이 팀 ID를 사용하고 있어 이름과 설명만
                  변경할 수 있습니다. 멀티팀 전환이 완료되기 전에는 보관하거나
                  삭제할 수 없습니다.
                </span>
              </div>
            )}

            <RequestError error={saveError} />

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
                    onClick={() => {
                      setSelected(null);
                      resetFeedback();
                    }}
                  >
                    변경 버리기
                  </AdminButton>
                </div>
              </div>
            ) : identity.isOrganizationAdmin ? (
              <>
                <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-4">
                  {selected.id !== TEAM_ID && (
                    <AdminButton
                      onClick={() =>
                        void updateTeam(
                          selected.status === "active" ? "archived" : "active",
                        )
                      }
                      disabled={saving || dirty}
                    >
                      {selected.status === "active" ? (
                        <>
                          <Archive size={14} /> 팀 보관
                        </>
                      ) : (
                        <>
                          <RotateCcw size={14} /> 팀 복원
                        </>
                      )}
                    </AdminButton>
                  )}
                  <AdminButton onClick={closeTeamDrawer} disabled={saving}>
                    취소
                  </AdminButton>
                  <AdminButton
                    variant="primary"
                    onClick={() => void updateTeam()}
                    disabled={saving || !dirty || draftName.trim().length < 2}
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

                {selected.id !== TEAM_ID && (
                  <section className="border-t border-red-200 pt-5">
                    <h3 className="text-sm font-extrabold text-red-900">
                      위험 작업
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-stone-600">
                      구성원, 프로젝트, 업무 또는 연동 데이터가 하나라도 있으면
                      영구 삭제되지 않습니다. 운영 이력을 유지하려면 팀 보관을
                      사용하세요.
                    </p>
                    <AdminButton
                      className="mt-3"
                      variant="danger"
                      onClick={() => {
                        setDeleteConfirmation("");
                        setDeletePrompt(true);
                      }}
                      disabled={saving || dirty}
                    >
                      <Trash2 size={14} /> 팀 영구 삭제
                    </AdminButton>
                  </section>
                )}
              </>
            ) : null}
          </div>
        )}
      </AdminDrawer>

      {selected && (
        <AdminModal
          open={deletePrompt}
          role="alertdialog"
          labelledBy="delete-team-title"
          onClose={() => !saving && setDeletePrompt(false)}
          className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-md border-2 border-stone-950 bg-white shadow-2xl"
        >
          <div
            className="relative p-5"
          >
            <button
              type="button"
              className="admin-icon-button absolute right-3 top-3"
              aria-label="닫기"
              onClick={() => setDeletePrompt(false)}
              disabled={saving}
            >
              <X size={18} />
            </button>
            <div className="flex gap-3 pr-9">
              <span className="grid size-9 shrink-0 place-items-center rounded bg-red-100 text-red-700">
                <Trash2 size={18} />
              </span>
              <div>
                <h2 id="delete-team-title" className="text-base font-extrabold">
                  {selected.name} 영구 삭제
                </h2>
                <p className="mt-1 text-xs leading-5 text-stone-600">
                  이 작업은 되돌릴 수 없습니다. 연결 데이터가 발견되면 서버에서
                  삭제를 중단합니다.
                </p>
              </div>
            </div>
            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-bold text-stone-700">
                확인을 위해 <strong>{selected.name}</strong> 입력
              </span>
              <input
                className="admin-input w-full"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoFocus
              />
            </label>
            <div className="mt-5 flex justify-end gap-2 border-t border-stone-200 pt-4">
              <AdminButton
                onClick={() => setDeletePrompt(false)}
                disabled={saving}
              >
                취소
              </AdminButton>
              <AdminButton
                variant="danger"
                onClick={() => void deleteTeam()}
                disabled={saving || deleteConfirmation.trim() !== selected.name}
              >
                {saving ? (
                  <SavingLabel label="삭제 중" />
                ) : (
                  <>
                    <Trash2 size={14} /> 영구 삭제
                  </>
                )}
              </AdminButton>
            </div>
          </div>
        </AdminModal>
      )}
    </AdminPage>
  );
}

function TeamNameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-stone-600">
        팀 이름
      </span>
      <input
        className="admin-input w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        minLength={2}
        maxLength={40}
        required
        placeholder="예: 디자인팀"
      />
    </label>
  );
}

function TeamDescriptionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-stone-600">
        설명
      </span>
      <textarea
        className="admin-textarea w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={200}
        placeholder="팀의 역할과 운영 범위를 입력하세요."
      />
      <span className="mt-1 block text-right font-mono text-[10px] text-stone-400">
        {value.length}/200
      </span>
    </label>
  );
}

function RequestError({ error }: { error: ApiFailure | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"
    >
      {error.message}
      {error.requestId && (
        <span className="mt-1 block font-mono text-[10px]">
          요청 ID: {error.requestId}
        </span>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l border-stone-100 first:border-l-0">
      <dt className="text-[10px] font-bold text-stone-400">{label}</dt>
      <dd className="mt-1 font-mono text-base font-bold text-stone-800">
        {value}
      </dd>
    </div>
  );
}
