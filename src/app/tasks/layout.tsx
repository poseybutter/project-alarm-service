import type { ReactNode } from "react";
import ModuleGuard from "@/components/ModuleGuard";

export const dynamic = "force-dynamic";

export default function TasksLayout({ children }: { children: ReactNode }) {
    return <ModuleGuard module="tasks">{children}</ModuleGuard>;
}
