"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ClientApiError } from "@/lib/api/client";

interface ApiState<T> {
  data: T | undefined;
  error: ClientApiError | null;
  loading: boolean;
}

/** Minimal fetch-on-mount + revalidate hook. Keeps last good data while refreshing or offline. */
export function useApi<T>(path: string | null, options: { refreshMs?: number } = {}) {
  const [state, setState] = useState<ApiState<T>>({ data: undefined, error: null, loading: Boolean(path) });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await api<T>(path);
      if (mounted.current) setState({ data, error: null, loading: false });
      return data;
    } catch (err) {
      if (mounted.current) setState((s) => ({ ...s, error: err as ClientApiError, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!options.refreshMs || !path) return;
    const id = setInterval(() => void load(), options.refreshMs);
    return () => clearInterval(id);
  }, [load, options.refreshMs, path]);

  const mutate = useCallback((updater: (prev: T | undefined) => T | undefined) => {
    setState((s) => ({ ...s, data: updater(s.data) }));
  }, []);

  return { ...state, reload: load, mutate };
}
