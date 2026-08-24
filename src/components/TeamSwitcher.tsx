"use client";

import { Building2, ChevronDown, LoaderCircle } from "lucide-react";
import { useAuth } from "./AuthProvider";

export default function TeamSwitcher() {
    const { teamId, teams, switchTeam, switchingTeam, teamSwitchError } = useAuth();

    if (!teamId || teams.length < 2) return null;

    return (
        <div className="min-w-0 max-w-36">
            <label className="relative flex h-8 min-w-0 items-center rounded border border-stone-200 bg-white pl-2 pr-7 text-stone-600 hover:border-stone-300">
                {switchingTeam ? (
                    <LoaderCircle className="mr-1.5 size-3.5 shrink-0 animate-spin" />
                ) : (
                    <Building2 className="mr-1.5 size-3.5 shrink-0" />
                )}
                <span className="sr-only">현재 팀 선택</span>
                <select
                    value={teamId}
                    disabled={switchingTeam}
                    aria-describedby={teamSwitchError ? "team-switch-error" : undefined}
                    onChange={(event) => {
                        void switchTeam(event.target.value).catch(() => undefined);
                    }}
                    className="min-w-0 flex-1 appearance-none truncate bg-transparent text-xs font-semibold outline-none disabled:cursor-wait"
                >
                    {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                            {team.name}
                        </option>
                    ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 size-3.5" />
            </label>
            {teamSwitchError && (
                <p
                    id="team-switch-error"
                    role="status"
                    className="mt-1 text-[10px] font-semibold leading-tight text-red-700"
                >
                    {teamSwitchError}
                </p>
            )}
        </div>
    );
}
