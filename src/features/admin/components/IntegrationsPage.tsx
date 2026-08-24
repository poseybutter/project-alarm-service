"use client";

import {
  CalendarDays,
  CheckCircle2,
  MessageSquareText,
  Send,
  Unplug,
} from "lucide-react";
import {
  AdminPage,
  ErrorState,
  LoadingRows,
} from "@/features/admin/components/AdminUi";
import { useAdminResource } from "@/features/admin/hooks/useAdminResource";

type IntegrationResponse = {
  teamCalendars: Array<{
    team_id: string;
    calendar_id: string;
    connection_email: string;
    updated_at: string;
  }>;
  calendarConnections: Array<{
    team_id: string;
    email: string;
    google_email: string;
    updated_at: string;
  }>;
  webhookCount: number;
  notificationCount: number;
  morningEnabledCount: number;
};

export function IntegrationsPage() {
  const { data, error, loading, reload } =
    useAdminResource<IntegrationResponse>("/api/admin/integrations");

  return (
    <AdminPage
      title="연동 관리"
      description="Google Calendar, Google Chat 웹훅, 모닝 브리핑의 운영 연결 상태를 점검합니다."
    >
      {loading && <LoadingRows count={4} />}
      {error && (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={reload}
        />
      )}
      {!loading && !error && data && (
        <div className="grid gap-3 lg:grid-cols-3">
          <IntegrationCard
            icon={<CalendarDays size={18} />}
            title="팀 Google Calendar"
            connected={data.teamCalendars.length > 0}
            summary={
              data.teamCalendars.length > 0
                ? `${data.teamCalendars.length}개 팀 캘린더 설정`
                : "설정된 팀 캘린더 없음"
            }
            details={data.teamCalendars.map(
              (row) => `${row.team_id} · ${row.connection_email}`,
            )}
          />
          <IntegrationCard
            icon={<CheckCircle2 size={18} />}
            title="개인 Calendar 인증"
            connected={data.calendarConnections.length > 0}
            summary={`${data.calendarConnections.length}명 연결`}
            details={data.calendarConnections.map(
              (row) => `${row.email} · ${row.google_email}`,
            )}
          />
          <IntegrationCard
            icon={<MessageSquareText size={18} />}
            title="Google Chat 알림"
            connected={data.webhookCount > 0}
            summary={`웹훅 ${data.webhookCount}개 · 브리핑 ${data.morningEnabledCount}/${data.notificationCount}명 활성`}
            details={[]}
          />
        </div>
      )}
    </AdminPage>
  );
}

function IntegrationCard({
  icon,
  title,
  connected,
  summary,
  details,
}: {
  icon: React.ReactNode;
  title: string;
  connected: boolean;
  summary: string;
  details: string[];
}) {
  return (
    <article className="rounded-md border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded border border-stone-200 bg-stone-50 text-stone-600">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold">{title}</h3>
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-extrabold ${connected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
          >
            {connected ? <Send size={11} /> : <Unplug size={11} />}
            {connected ? "연결됨" : "확인 필요"}
          </span>
        </div>
      </div>
      <p className="mt-4 text-xs font-bold text-stone-700">{summary}</p>
      {details.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-stone-100 pt-3">
          {details.slice(0, 5).map((detail) => (
            <li
              key={detail}
              className="truncate font-mono text-[10px] text-stone-500"
            >
              {detail}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
