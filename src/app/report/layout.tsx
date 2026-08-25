import type { ReactNode } from "react";
import ModuleGuard from "@/components/ModuleGuard";

export const dynamic = "force-dynamic";

export default function ReportLayout({ children }: { children: ReactNode }) {
    return <ModuleGuard module="report">{children}</ModuleGuard>;
}
