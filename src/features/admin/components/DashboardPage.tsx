"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Blocks,
  BriefcaseBusiness,
  ClipboardList,
  ListChecks,
  PauseCircle,
  RefreshCw,
  UserRoundCheck,
  Users,
} from "lucide-react";
import {
  AdminButton,
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/features/admin/components/AdminUi";
import { useAdminResource } from "@/features/admin/hooks/useAdminResource";
import type { AdminDashboard } from "@/features/admin/types";

export function DashboardPage() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const { data, error, loading, reload } = useAdminResource<AdminDashboard>(
    "/api/admin/dashboard",
  );

  const link = (path: string) => `${path}${query ? `?${query}` : ""}`;

  return (
    <AdminPage
      title="운영 현황"
      description="승인 대기, 구성원 상태, 팀별 운영 지표를 실제 데이터 기준으로 확인합니다."
      action={
        <AdminButton onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          새로고침
        </AdminButton>
      }
    >
      {loading && <LoadingRows count={6} />}
      {error && (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={reload}
        />
      )}
      {!loading && !error && data && (
        <div className="space-y-6">
          <section aria-labelledby="attention-title">
            <SectionTitle
              id="attention-title"
              title="조치가 필요한 항목"
              detail={formatGeneratedAt(data.generatedAt)}
            />
            <div className="mt-2 space-y-2">
              <ActionRow
                tone="amber"
                icon={<ClipboardList size={18} />}
                title={`접근 요청 ${data.totals.pendingRequests}건이 승인을 기다리고 있습니다`}
                description="팀과 역할을 지정한 뒤 승인하거나 요청을 거절할 수 있습니다."
                href={link("/admin/requests")}
                action="요청 검토"
              />
              {data.totals.suspendedMembers > 0 && (
                <ActionRow
                  tone="red"
                  icon={<PauseCircle size={18} />}
                  title={`정지 상태 구성원이 ${data.totals.suspendedMembers}명 있습니다`}
                  description="장기 정지 계정의 복구 또는 유지 여부를 검토해 주세요."
                  href={link("/admin/members")}
                  action="구성원 보기"
                />
              )}
              {data.totals.pendingRequests === 0 &&
                data.totals.suspendedMembers === 0 && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                    현재 즉시 처리해야 할 운영 항목이 없습니다.
                  </div>
                )}
            </div>
          </section>

          <section aria-labelledby="metrics-title">
            <SectionTitle id="metrics-title" title="조직 현황" />
            <div className="mt-2 grid overflow-hidden rounded-md border border-stone-200 bg-white sm:grid-cols-2 xl:grid-cols-5">
              <Metric
                icon={<Users size={16} />}
                label="활성 구성원"
                value={data.totals.members}
                unit="명"
                href={link("/admin/members")}
              />
              <Metric
                icon={<UserRoundCheck size={16} />}
                label="승인 대기"
                value={data.totals.pendingRequests}
                unit="건"
                href={link("/admin/requests")}
                tone="amber"
              />
              <Metric
                icon={<PauseCircle size={16} />}
                label="정지"
                value={data.totals.suspendedMembers}
                unit="명"
                href={link("/admin/members")}
                tone="red"
              />
              <Metric
                icon={<BriefcaseBusiness size={16} />}
                label="프로젝트"
                value={data.totals.activeProjects}
                unit="개"
                href="/manage"
              />
              <Metric
                icon={<ListChecks size={16} />}
                label="전체 업무"
                value={data.totals.openTasks}
                unit="건"
                href="/tasks"
              />
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
            <section aria-labelledby="teams-title">
              <SectionTitle
                id="teams-title"
                title="팀별 인원"
                action={
                  <Link
                    href={link("/admin/teams")}
                    className="inline-flex items-center gap-1 text-xs font-bold text-stone-600 hover:text-stone-950"
                  >
                    팀 관리 <ArrowRight size={13} />
                  </Link>
                }
              />
              {data.teams.length === 0 ? (
                <div className="mt-2">
                  <EmptyState
                    title="등록된 팀이 없습니다"
                    description="팀을 만든 뒤 구성원을 배정해 주세요."
                  />
                </div>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-md border border-stone-200 bg-white">
                  <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                    <thead className="bg-stone-50 text-stone-500">
                      <tr>
                        <th className="px-3 py-2.5 font-bold">팀</th>
                        <th className="px-3 py-2.5 text-right font-bold">
                          활성 인원
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold">
                          관리자
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold">
                          프로젝트
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.teams.map((team) => (
                        <tr key={team.id} className="border-t border-stone-100">
                          <td className="px-3 py-3">
                            <span className="font-extrabold text-stone-900">
                              {team.name}
                            </span>
                            <span className="ml-2 font-mono text-[10px] text-stone-400">
                              {team.id}
                            </span>
                            <span className="ml-2 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                              운영 중
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-bold">
                            {team.memberCount > 0 ? (
                              team.memberCount
                            ) : (
                              <span className="font-sans text-[11px] font-bold text-stone-400">
                                미배정
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-mono">
                            {team.adminCount}
                          </td>
                          <td className="px-3 py-3 text-right font-mono">
                            {team.projectCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby="activity-title">
              <SectionTitle
                id="activity-title"
                title="최근 관리자 활동"
                action={
                  <Link
                    href={link("/admin/logs")}
                    className="inline-flex items-center gap-1 text-xs font-bold text-stone-600 hover:text-stone-950"
                  >
                    감사 로그 <ArrowRight size={13} />
                  </Link>
                }
              />
              <div className="mt-2 overflow-hidden rounded-md border border-stone-200 bg-white">
                {data.recentActivity.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs leading-5 text-stone-500">
                    아직 기록된 관리자 변경 이력이 없습니다.
                    <br />
                    V29 적용 후 변경부터 기록됩니다.
                  </p>
                ) : (
                  data.recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="border-t border-stone-100 px-3 py-3 first:border-t-0"
                    >
                      <p className="text-xs font-bold text-stone-800">
                        {activityLabel(activity.action)} ·{" "}
                        {activity.targetLabel}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-stone-400">
                        {formatDateTime(activity.createdAt)} ·{" "}
                        {activity.actorEmail}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <section aria-labelledby="quick-title">
            <SectionTitle id="quick-title" title="빠른 작업" />
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <QuickLink
                icon={<ClipboardList size={17} />}
                title="접근 요청 검토"
                detail={`현재 ${data.totals.pendingRequests}건 대기`}
                href={link("/admin/requests")}
              />
              <QuickLink
                icon={<Users size={17} />}
                title="구성원 권한 변경"
                detail="팀 역할과 계정 상태 관리"
                href={link("/admin/members")}
              />
              <QuickLink
                icon={<Blocks size={17} />}
                title="팀 생성"
                detail="새 직군 또는 협업팀 추가"
                href={link("/admin/teams")}
              />
            </div>
          </section>
        </div>
      )}
    </AdminPage>
  );
}

function SectionTitle({
  id,
  title,
  detail,
  action,
}: {
  id: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center gap-3">
      <h3 id={id} className="text-sm font-extrabold">
        {title}
      </h3>
      <div className="flex-1" />
      {detail && (
        <span className="font-mono text-[10px] text-stone-400">{detail}</span>
      )}
      {action}
    </div>
  );
}

function ActionRow({
  tone,
  icon,
  title,
  description,
  href,
  action,
}: {
  tone: "amber" | "red";
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  const classes =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${classes}`}
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-[220px] flex-1">
        <p className="text-[13px] font-extrabold text-stone-900">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-stone-600">{description}</p>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-stone-300 bg-white px-3 text-xs font-extrabold text-stone-800 hover:border-stone-500"
      >
        {action} <ArrowRight size={13} />
      </Link>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
  href,
  tone = "stone",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  href: string;
  tone?: "stone" | "amber" | "red";
}) {
  const color =
    tone === "red"
      ? "text-red-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-stone-900";
  return (
    <Link
      href={href}
      className="min-h-28 border-b border-r border-stone-100 p-4 transition-colors hover:bg-stone-50 sm:last:border-r-0 xl:border-b-0"
    >
      <span className="flex items-center gap-2 text-xs font-bold text-stone-500">
        {icon}
        {label}
      </span>
      <span className={`mt-3 block font-mono text-2xl font-bold ${color}`}>
        {value}
        <small className="ml-1 text-xs font-medium text-stone-400">
          {unit}
        </small>
      </span>
    </Link>
  );
}

function QuickLink({
  icon,
  title,
  detail,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center gap-3 rounded-md border border-stone-300 bg-white p-3 hover:border-stone-700"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded border border-stone-200 bg-stone-50 text-stone-600">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[13px]">{title}</strong>
        <span className="mt-0.5 block text-[11px] text-stone-500">
          {detail}
        </span>
      </span>
      <ArrowRight size={15} className="text-stone-400" />
    </Link>
  );
}

function formatGeneratedAt(value: string) {
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }).format(new Date(value))} 기준`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "access_request.approved": "접근 승인",
    "access_request.rejected": "접근 거절",
    "member.updated": "구성원 변경",
    "team.created": "팀 생성",
    "team.updated": "팀 정보 변경",
    "team.archived": "팀 보관",
    "team.restored": "팀 복원",
    "team.deleted": "팀 영구 삭제",
  };
  return labels[action] ?? action;
}
