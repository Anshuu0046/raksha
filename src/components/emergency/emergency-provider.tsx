"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, type Fix } from "@/components/providers/location-provider";
import { readBatteryLevel } from "@/hooks/use-battery";
import { useOnline } from "@/hooks/use-online";
import { api, ClientApiError } from "@/lib/api/client";
import { createEmergencyTriggerProvider, type EmergencyTriggerProvider } from "@/lib/emergency/triggers";
import { distanceMeters } from "@/lib/location/geo";
import { Outbox, type OutboxItem, type SendOutcome } from "@/lib/offline/outbox";
import { browserStorage, readJson, writeJson } from "@/lib/offline/storage";
import type { EmergencyStatusPayload, TriggerMethod } from "@/types";

export type EmergencyPhase = "idle" | "starting" | "active" | "ending" | "ended";
export type EndReason = "safe" | "mistake" | "other";

/** Everything needed to keep an emergency going across reloads and network loss. */
export interface LocalEmergency {
  clientEventId: string;
  eventId: string | null;
  method: TriggerMethod;
  startedAt: string;
  shareUrl: string | null;
  serverConfirmed: boolean;
  endedAt?: string;
  endReason?: EndReason;
  /** Cancelled before the alert ever reached the server: nobody was notified. */
  neverSent?: boolean;
}

interface EmergencyValue {
  phase: EmergencyPhase;
  local: LocalEmergency | null;
  status: EmergencyStatusPayload | null;
  lastSent: { fix: Fix; at: string } | null;
  trackingActive: boolean;
  queued: number;
  online: boolean;
  authError: boolean;
  provider: EmergencyTriggerProvider | null;
  trigger: (method: TriggerMethod) => void;
  cancel: (reason: EndReason) => Promise<void>;
  newShareLink: (revokeExisting?: boolean) => Promise<string | null>;
  dismiss: () => void;
  refreshStatus: () => Promise<void>;
}

const EmergencyContext = createContext<EmergencyValue | null>(null);
const LOCAL_KEY = "raksha.emergency.v1";
const SEND_INTERVAL_MS = 10_000;
const MIN_MOVE_M = 15;

export function EmergencyProvider({
  initialActiveEventId,
  children,
}: {
  initialActiveEventId: string | null;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const online = useOnline();
  const storage = useMemo(() => (typeof window === "undefined" ? null : browserStorage()), []);
  const outbox = useMemo(() => (storage ? new Outbox(storage) : null), [storage]);

  const [local, setLocalState] = useState<LocalEmergency | null>(null);
  const [status, setStatus] = useState<EmergencyStatusPayload | null>(null);
  const [lastSent, setLastSent] = useState<{ fix: Fix; at: string } | null>(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [queued, setQueued] = useState(0);
  const [authError, setAuthError] = useState(false);
  const [provider, setProvider] = useState<EmergencyTriggerProvider | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const localRef = useRef<LocalEmergency | null>(null);
  const lastSentRef = useRef<{ fix: Fix; at: number } | null>(null);

  const setLocal = useCallback(
    (next: LocalEmergency | null | ((prev: LocalEmergency | null) => LocalEmergency | null)) => {
      const value = typeof next === "function" ? next(localRef.current) : next;
      localRef.current = value;
      setLocalState(value);
      if (storage) {
        if (value) writeJson(storage, LOCAL_KEY, value);
        else storage.removeItem(LOCAL_KEY);
      }
    },
    [storage],
  );

  const phase: EmergencyPhase = !local
    ? "idle"
    : local.endedAt
      ? "ended"
      : !local.serverConfirmed
        ? "starting"
        : "active";

  // ------------------------------------------------------------------ outbox sender
  const send = useCallback(async (item: OutboxItem): Promise<SendOutcome> => {
    const current = localRef.current;
    const body = { ...(item.body as Record<string, unknown>) };
    if (item.kind === "location") {
      body.eventId ??= current?.eventId;
      if (!body.eventId) return "retry"; // trigger not confirmed yet; ordering keeps it behind.
    }
    try {
      const data = await api<Record<string, unknown>>(item.url, { body, keepalive: item.kind === "trigger", timeoutMs: 12_000 });
      setAuthError(false);
      if (item.kind === "cancel") {
        setLocal((prev) => (prev ? { ...prev, neverSent: Boolean(data.neverSent) } : prev));
      }
      if (item.kind === "trigger") {
        setLocal((prev) =>
          prev && prev.clientEventId === body.clientEventId
            ? { ...prev, eventId: data.eventId as string, shareUrl: (data.shareUrl as string) ?? prev.shareUrl, serverConfirmed: true }
            : prev,
        );
      }
      return "ok";
    } catch (err) {
      const e = err as ClientApiError;
      if (e.isNetwork || e.code === "SERVICE_UNAVAILABLE" || e.code === "INTERNAL_ERROR" || e.code === "RATE_LIMITED") return "retry";
      if (e.code === "UNAUTHENTICATED") {
        setAuthError(true);
        return "retry";
      }
      // Ended elsewhere, or a permanently invalid request: drop it.
      return "drop";
    }
  }, [setLocal]);

  const flush = useCallback(async () => {
    if (!outbox) return;
    await outbox.flush(send);
    setQueued(outbox.pending());
  }, [outbox, send]);

  // ------------------------------------------------------------------ status polling
  const refreshStatus = useCallback(async () => {
    const eventId = localRef.current?.eventId;
    if (!eventId) return;
    try {
      const { emergency } = await api<{ emergency: EmergencyStatusPayload | null }>(`/api/emergency/status?eventId=${eventId}`);
      setStatus(emergency);
      if (emergency && emergency.event.status !== "active" && !localRef.current?.endedAt) {
        // Ended from another device (or a late check-in): reflect it here.
        setLocal((prev) =>
          prev ? { ...prev, endedAt: emergency.event.endedAt ?? new Date().toISOString(), endReason: (emergency.event.endReason as EndReason) ?? "safe" } : prev,
        );
      }
    } catch {
      // offline: keep showing the last known status
    }
  }, [setLocal]);

  // ------------------------------------------------------------------ live location
  const queueFix = useCallback(
    (fix: Fix) => {
      if (!outbox || !localRef.current || localRef.current.endedAt) return;
      const prev = lastSentRef.current;
      const now = Date.now();
      if (prev && now - prev.at < SEND_INTERVAL_MS && distanceMeters(prev.fix, fix) < MIN_MOVE_M) return;
      lastSentRef.current = { fix, at: now };
      setLastSent({ fix, at: new Date(now).toISOString() });
      outbox.enqueue({
        id: crypto.randomUUID(),
        kind: "location",
        url: "/api/emergency/location",
        body: {
          eventId: localRef.current.eventId ?? undefined,
          locations: [{ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, speed: fix.speed, heading: fix.heading, recordedAt: fix.recordedAt }],
        },
      });
      void flush();
    },
    [flush, outbox],
  );

  // ------------------------------------------------------------------ trigger
  const trigger = useCallback(
    (method: TriggerMethod) => {
      if (!outbox) return;
      const current = localRef.current;
      if (current && !current.endedAt) return; // already in an emergency: never double-trigger
      try {
        navigator.vibrate?.([300, 120, 300]);
      } catch {
        // not supported
      }
      const clientEventId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      setStatus(null);
      lastSentRef.current = null;
      setLastSent(null);
      setLocal({ clientEventId, eventId: null, method, startedAt, shareUrl: null, serverConfirmed: false });

      // Use whatever position we already have so the alert goes out NOW; a fresh fix follows.
      const recent = location.fix && Date.now() - new Date(location.fix.recordedAt).getTime() < 5 * 60_000 ? location.fix : null;
      const known = recent ?? location.lastKnown;
      void (async () => {
        const batteryLevel = await Promise.race([readBatteryLevel(), new Promise<null>((r) => setTimeout(() => r(null), 150))]);
        outbox.enqueue({
          id: clientEventId,
          kind: "trigger",
          url: "/api/emergency/trigger",
          body: {
            clientEventId,
            method,
            triggeredAt: startedAt,
            batteryLevel,
            location: known ? { lat: known.lat, lng: known.lng, accuracy: known.accuracy, recordedAt: known.recordedAt } : null,
          },
        });
        setQueued(outbox.pending());
        await flush();
      })();
    },
    [flush, location.fix, location.lastKnown, outbox, setLocal],
  );

  // ------------------------------------------------------------------ cancel
  const cancel = useCallback(
    async (reason: EndReason) => {
      const current = localRef.current;
      if (!current || !outbox) return;
      const endedAt = new Date().toISOString();
      // Pull any unsent alert and location points out of the queue. If the alert might already
      // have reached the server, the cancel below (by clientEventId) closes it there too; the
      // server's reply tells us whether anyone was ever notified.
      if (!current.serverConfirmed) outbox.clear("trigger");
      outbox.clear("location");
      outbox.enqueue({
        id: crypto.randomUUID(),
        kind: "cancel",
        url: "/api/emergency/cancel",
        body: { eventId: current.eventId ?? undefined, clientEventId: current.clientEventId, reason },
      });
      setLocal({ ...current, endedAt, endReason: reason, neverSent: undefined });
      await flush();
    },
    [flush, outbox, setLocal],
  );

  const newShareLink = useCallback(async (revokeExisting = false) => {
    const eventId = localRef.current?.eventId;
    if (!eventId) return localRef.current?.shareUrl ?? null;
    try {
      const { url } = await api<{ url: string }>("/api/emergency/share", { body: { eventId, revokeExisting } });
      setLocal((prev) => (prev ? { ...prev, shareUrl: url } : prev));
      return url;
    } catch {
      return localRef.current?.shareUrl ?? null;
    }
  }, [setLocal]);

  const dismiss = useCallback(() => {
    setLocal(null);
    setStatus(null);
    setLastSent(null);
  }, [setLocal]);

  // ------------------------------------------------------------------ effects
  // Restore an in-progress emergency after reload, or adopt one the server knows about.
  useEffect(() => {
    if (!storage) return;
    const saved = readJson<LocalEmergency | null>(storage, LOCAL_KEY, null);
    if (saved) {
      localRef.current = saved;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalState(saved);
    } else if (initialActiveEventId) {
      setLocal({
        clientEventId: crypto.randomUUID(),
        eventId: initialActiveEventId,
        method: "api",
        startedAt: new Date().toISOString(),
        shareUrl: null,
        serverConfirmed: true,
      });
    }
    setHydrated(true);
    const p = createEmergencyTriggerProvider();
    setProvider(p);
    return () => p.dispose();
    // Mount-only: restore once and create the platform trigger provider once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every trigger source (on-screen button, keyboard, Android hardware) flows through the provider.
  useEffect(() => {
    if (!provider) return;
    return provider.subscribe((e) => trigger(e.method));
  }, [provider, trigger]);

  // Live tracking while the emergency is open.
  const tracking = phase === "starting" || phase === "active";
  useEffect(() => {
    if (!tracking) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrackingActive(true);
    void location.requestFix({ highAccuracy: true, timeoutMs: 15_000 }).then((f) => f && queueFix(f));
    const stop = location.track(queueFix, true);
    return () => {
      stop();
      setTrackingActive(false);
    };
    // location.requestFix/track are stable callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking, queueFix]);

  // Flush on reconnect and keep retrying while anything is queued.
  useEffect(() => {
    if (!hydrated) return;
    // Syncing with an external queue (localStorage outbox) on mount/reconnect is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void flush();
    const id = setInterval(() => {
      if (outbox && outbox.pending() > 0) void flush();
    }, 4000);
    return () => clearInterval(id);
  }, [flush, hydrated, online, outbox]);

  // Poll delivery status: fast at first (contacts being notified), slower once settled.
  const eventId = local?.eventId ?? null;
  useEffect(() => {
    if (!eventId) return;
    void refreshStatus();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(async () => {
        await refreshStatus();
        loop();
      }, Date.now() - started < 60_000 ? 3000 : 15_000);
    };
    loop();
    return () => clearTimeout(timer);
  }, [eventId, refreshStatus, phase]);

  const value = useMemo<EmergencyValue>(
    () => ({ phase, local, status, lastSent, trackingActive, queued, online, authError, provider, trigger, cancel, newShareLink, dismiss, refreshStatus }),
    [phase, local, status, lastSent, trackingActive, queued, online, authError, provider, trigger, cancel, newShareLink, dismiss, refreshStatus],
  );
  return <EmergencyContext.Provider value={value}>{children}</EmergencyContext.Provider>;
}

export function useEmergency(): EmergencyValue {
  const ctx = useContext(EmergencyContext);
  if (!ctx) throw new Error("useEmergency must be used inside <EmergencyProvider>");
  return ctx;
}
