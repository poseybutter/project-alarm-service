import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function ManageLayout({ children }: { children: ReactNode }) {
    return children;
}
