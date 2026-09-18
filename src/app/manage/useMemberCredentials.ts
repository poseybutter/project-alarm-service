"use client";

import { useCallback, useMemo } from "react";

export type CredentialItem = {
    id: number;
    label: string;
    hasPassword: boolean;
    notes: string | null;
    sortOrder: number;
    updatedAt: string;
};

export type MemberWithCredentials = {
    profileId: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    credentials: CredentialItem[];
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
            (body as { message?: string }).message ?? `HTTP ${res.status}`,
        );
    }
    return res.json() as Promise<T>;
}

/** 팀원 자격증명 CRUD + reveal 훅 */
export function useMemberCredentials(teamId: string | null) {
    const load = useCallback(async (): Promise<MemberWithCredentials[]> => {
        if (!teamId) return [];
        const res = await api<{ members: MemberWithCredentials[] }>(
            `/api/member-credentials?teamId=${encodeURIComponent(teamId)}`,
        );
        return res.members;
    }, [teamId]);

    const create = useCallback(
        async (profileId: string, label: string, password?: string, notes?: string) => {
            if (!teamId) return;
            await api("/api/member-credentials", {
                method: "POST",
                body: JSON.stringify({ teamId, profileId, label, password, notes }),
            });
        },
        [teamId],
    );

    const update = useCallback(
        async (id: number, patch: { label?: string; password?: string; notes?: string }) => {
            if (!teamId) return;
            await api("/api/member-credentials", {
                method: "PATCH",
                body: JSON.stringify({ teamId, id, ...patch }),
            });
        },
        [teamId],
    );

    const remove = useCallback(
        async (id: number) => {
            if (!teamId) return;
            await api("/api/member-credentials", {
                method: "DELETE",
                body: JSON.stringify({ teamId, id }),
            });
        },
        [teamId],
    );

    const reveal = useCallback(
        async (credentialId: number, totpToken?: string): Promise<string> => {
            if (!teamId) throw new Error("No team");
            const res = await api<{ password: string }>(
                "/api/member-credentials/reveal",
                {
                    method: "POST",
                    body: JSON.stringify({ teamId, credentialId, totpToken }),
                },
            );
            return res.password;
        },
        [teamId],
    );

    return useMemo(() => ({
        load,
        create,
        update,
        remove,
        reveal,
    }), [load, create, update, remove, reveal]);
}
