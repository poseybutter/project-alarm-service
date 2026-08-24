"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/features/admin/components/AdminShell";
import type { ApiFailure } from "@/features/admin/types";

export function useAdminResource<T>(path: string) {
  const { selectedTeamId } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedTeamId) params.set("team", selectedTeamId);
      const response = await fetch(
        `${path}${params.size ? `?${params}` : ""}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as T & ApiFailure;
      if (!response.ok) throw body;
      setData(body);
    } catch (reason) {
      const failure = reason as ApiFailure;
      setError({
        message: failure?.message || "네트워크 연결을 확인해 주세요.",
        requestId: failure?.requestId,
      });
    } finally {
      setLoading(false);
    }
  }, [path, selectedTeamId]);

  useEffect(() => {
    // Data fetching is the external synchronization this hook owns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  useEffect(() => {
    const refreshOnFocus = () => void reload();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [reload]);

  return { data, error, loading, reload, setData };
}
