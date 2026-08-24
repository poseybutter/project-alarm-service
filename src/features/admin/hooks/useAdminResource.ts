"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdmin } from "@/features/admin/components/AdminShell";
import type { ApiFailure } from "@/features/admin/types";

export function useAdminResource<T>(path: string) {
  const { selectedTeamId } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const controllerRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedTeamId) params.set("team", selectedTeamId);
      const response = await fetch(
        `${path}${params.size ? `?${params}` : ""}`,
        { cache: "no-store", signal: controller.signal },
      );
      const body = (await response.json()) as T & ApiFailure;
      if (!response.ok) throw body;
      setData(body);
    } catch (reason) {
      if (controller.signal.aborted) return;
      const failure = reason as ApiFailure;
      setError({
        message: failure?.message || "네트워크 연결을 확인해 주세요.",
        requestId: failure?.requestId,
      });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [path, selectedTeamId]);

  useEffect(() => {
    // Data fetching is the external synchronization this hook owns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      controllerRef.current?.abort();
    };
  }, [reload]);

  return { data, error, loading, reload, setData };
}
