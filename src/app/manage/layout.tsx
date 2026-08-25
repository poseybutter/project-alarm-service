import type { ReactNode } from "react";
import ModuleGuard from "@/components/ModuleGuard";

export const dynamic = "force-dynamic";

export default function ManageLayout({ children }: { children: ReactNode }) {
    return <ModuleGuard module="manage">{children}</ModuleGuard>;
}
