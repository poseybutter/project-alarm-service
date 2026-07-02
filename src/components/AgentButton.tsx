"use client";

import { usePathname, useRouter } from "next/navigation";

export default function AgentButton() {
    const router = useRouter();
    const pathname = usePathname();
    const active = pathname === "/agents";

    return (
        <button
            type="button"
            onClick={() => router.push("/agents")}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                active
                    ? "bg-amber-100 text-amber-700"
                    : "text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            }`}
            aria-label="알림 에이전트"
            title="알림 에이전트"
        >
            <i className="ri-robot-2-line text-xl" />
        </button>
    );
}
