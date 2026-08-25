import type { ReactNode } from "react";
import ModuleGuard from "@/components/ModuleGuard";

export const dynamic = "force-dynamic";

export default function AgentsLayout({ children }: { children: ReactNode }) {
    return <ModuleGuard module="agent">{children}</ModuleGuard>;
}
