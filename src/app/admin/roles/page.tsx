import { Check, Minus, ShieldCheck } from "lucide-react";
import { AdminPage } from "@/features/admin/components/AdminUi";

const PERMISSIONS = [
  {
    key: "admin.read",
    label: "팀 관리자 영역 조회",
    admin: true,
    member: false,
  },
  {
    key: "requests.review",
    label: "접근 요청 승인·거절",
    admin: true,
    member: false,
  },
  {
    key: "members.manage",
    label: "구성원 역할·상태 변경",
    admin: true,
    member: false,
  },
  { key: "teams.manage", label: "팀 생성·설정", admin: true, member: false },
  { key: "roles.manage", label: "역할·권한 관리", admin: true, member: false },
  { key: "audit.read", label: "감사 로그 조회", admin: true, member: false },
  {
    key: "integrations.manage",
    label: "운영 연동 관리",
    admin: true,
    member: false,
  },
] as const;

export default function AdminRolesPage() {
  return (
    <AdminPage
      title="역할 및 권한"
      description="현재 운영 중인 역할별 권한입니다. 권한 판정은 화면이 아니라 서버 API에서 강제합니다."
    >
      <div className="mb-4 flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
        <ShieldCheck className="mt-0.5 shrink-0" size={18} />
        <p>
          조직 관리자는 별도 명단으로 관리하며 모든 팀 범위에 접근합니다. 팀
          관리자·구성원은 기존 데이터와 호환되는 역할이고, 협업자와 뷰어는
          Spring 권한 서비스 전환 단계에서 세분화합니다.
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="px-4 py-3 font-bold">권한</th>
              <th className="w-28 px-4 py-3 text-center font-bold">관리자</th>
              <th className="w-28 px-4 py-3 text-center font-bold">구성원</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((permission) => (
              <tr key={permission.key} className="border-t border-stone-100">
                <td className="px-4 py-3">
                  <strong className="block text-[13px] text-stone-800">
                    {permission.label}
                  </strong>
                  <span className="mt-0.5 block font-mono text-[10px] text-stone-400">
                    {permission.key}
                  </span>
                </td>
                <PermissionCell enabled={permission.admin} />
                <PermissionCell enabled={permission.member} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}

function PermissionCell({ enabled }: { enabled: boolean }) {
  return (
    <td className="px-4 py-3 text-center">
      <span
        className={`mx-auto grid size-6 place-items-center rounded border ${enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-stone-200 bg-stone-50 text-stone-300"}`}
        aria-label={enabled ? "허용" : "허용 안 함"}
      >
        {enabled ? <Check size={14} /> : <Minus size={14} />}
      </span>
    </td>
  );
}
