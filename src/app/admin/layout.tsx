import { redirect } from "next/navigation";
import { AdminShell } from "@/features/admin/components/AdminShell";
import {
  AdminApiError,
  requireAdminSession,
} from "@/features/admin/server/adminRepository";
import "./admin.css";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let bootstrap;
  try {
    bootstrap = await requireAdminSession(null);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) {
      redirect("/login?next=/admin");
    }
    if (error instanceof AdminApiError && error.status === 403) {
      redirect("/manage?admin=forbidden");
    }
    throw error;
  }

  return <AdminShell bootstrap={bootstrap}>{children}</AdminShell>;
}
