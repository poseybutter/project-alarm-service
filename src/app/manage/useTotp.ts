"use client";

import { useCallback, useMemo } from "react";

export type TotpStatus = {
    teamRequiresTotp: boolean;
    userHasTotp: boolean;
    setupComplete: boolean;
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

/** TOTP 인증 관련 API 호출 훅 */
export function useTotp(teamId: string | null) {
    const checkStatus = useCallback(async (): Promise<TotpStatus> => {
        if (!teamId) return { teamRequiresTotp: false, userHasTotp: false, setupComplete: false };
        return api<TotpStatus>(
            `/api/totp/status?teamId=${encodeURIComponent(teamId)}`,
        );
    }, [teamId]);

    const setup = useCallback(async (): Promise<{ qrDataUrl: string; secret: string }> => {
        if (!teamId) throw new Error("No team");
        return api("/api/totp/setup", {
            method: "POST",
            body: JSON.stringify({ teamId }),
        });
    }, [teamId]);

    const verifySetup = useCallback(async (code: string): Promise<{ ok: boolean; message?: string }> => {
        if (!teamId) return { ok: false };
        return api("/api/totp/verify-setup", {
            method: "POST",
            body: JSON.stringify({ teamId, code }),
        });
    }, [teamId]);

    const verify = useCallback(async (code: string): Promise<{ ok: boolean; token?: string; needSetup?: boolean; message?: string }> => {
        if (!teamId) return { ok: false };
        return api("/api/totp/verify", {
            method: "POST",
            body: JSON.stringify({ teamId, code }),
        });
    }, [teamId]);

    return useMemo(() => ({
        checkStatus,
        setup,
        verifySetup,
        verify,
    }), [checkStatus, setup, verifySetup, verify]);
}
