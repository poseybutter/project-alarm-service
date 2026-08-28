import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import ModuleGuard from "@/components/ModuleGuard";
import { getServerCurrentTeamRole } from "@/infrastructure/supabase/server";

export const dynamic = "force-dynamic";

// Server-side gamification check: redirect before rendering if the module is
// disabled for the user's current team. RLS policies (V47+) additionally block
// direct Supabase reads/writes from the client for inactive teams.
export default async function QuestsLayout({ children }: { children: ReactNode }) {
    const { supabase, teamId } = await getServerCurrentTeamRole();

    if (teamId) {
        const { data } = await supabase
            .from("team_modules")
            .select("enabled")
            .eq("team_id", teamId)
            .eq("module", "gamification")
            .maybeSingle();

        // A row that explicitly sets enabled=false means the module is off.
        // No row (null) falls back to "all modules active" per team-context convention.
        if (data !== null && !data.enabled) {
            redirect("/home");
        }
    }

    return <ModuleGuard module="gamification">{children}</ModuleGuard>;
}
