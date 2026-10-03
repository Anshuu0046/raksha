"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePermission, type PermissionValue } from "@/hooks/use-permission";
import { DEMO_POSITION } from "@/lib/maps/demo";
import { browserStorage, readJson, writeJson } from "@/lib/offline/storage";

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  /** Device time of the fix (ISO). */
  recordedAt: string;
  simulated?: boolean;
}

export type LocationStatus = "idle" | "locating" | "ok" | "denied" | "unavailable" | "unsupported" | "timeout";

interface LocationValue {
  fix: Fix | null;
  /** Last fix persisted from a previous session: shown as "last known" when GPS fails. */
  lastKnown: Fix | null;
  status: LocationStatus;
  permission: PermissionValue;
  demo: boolean;
  /** Ask for a fresh fix (prompts for permission if needed). Resolves null on failure. */
  requestFix: (opts?: { highAccuracy?: boolean; timeoutMs?: number }) => Promise<Fix | null>;
  /** Continuous tracking; returns stop(). Used during emergencies and journeys. */
  track: (onFix: (fix: Fix) => void, highAccuracy?: boolean) => () => void;
}

const LocationContext = createContext<LocationValue | null>(null);
const LAST_KEY = "raksha.lastFix.v1";

function toFix(pos: GeolocationPosition): Fix {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
    speed: pos.coords.speed ?? null,
    heading: pos.coords.heading ?? null,
    recordedAt: new Date(pos.timestamp || Date.now()).toISOString(),
  };
}

function simulatedFix(seq = 0): Fix {
  return {
    lat: DEMO_POSITION.lat + seq * 0.00008,
    lng: DEMO_POSITION.lng + seq * 0.00005,
    accuracy: DEMO_POSITION.accuracy,
    speed: null,
    heading: null,
    recordedAt: new Date().toISOString(),
    simulated: true,
  };
}

export function LocationProvider({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  const { state: permission, refresh } = usePermission("geolocation");
  const [fix, setFix] = useState<Fix | null>(null);
  const [lastKnown, setLastKnown] = useState<Fix | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");
  const seq = useRef(0);

  useEffect(() => {
    // Restore the persisted last-known position after mount (localStorage is client-only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastKnown(readJson<Fix | null>(browserStorage(), LAST_KEY, null));
  }, []);

  const accept = useCallback(
    (f: Fix) => {
      setFix(f);
      setStatus("ok");
      if (!demo) {
        setLastKnown(f);
        writeJson(browserStorage(), LAST_KEY, f);
      }
    },
    [demo],
  );

  const requestFix = useCallback<LocationValue["requestFix"]>(
    async ({ highAccuracy = true, timeoutMs = 10_000 } = {}) => {
      if (demo) {
        const f = simulatedFix(seq.current++);
        accept(f);
        return f;
      }
      if (!("geolocation" in navigator)) {
        setStatus("unsupported");
        return null;
      }
      setStatus((s) => (s === "ok" ? s : "locating"));
      return new Promise<Fix | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const f = toFix(pos);
            accept(f);
            void refresh();
            resolve(f);
          },
          (err) => {
            setStatus(err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable");
            void refresh();
            resolve(null);
          },
          { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: 15_000 },
        );
      });
    },
    [accept, demo, refresh],
  );

  const track = useCallback<LocationValue["track"]>(
    (onFix, highAccuracy = true) => {
      if (demo) {
        const id = setInterval(() => {
          const f = simulatedFix(seq.current++);
          accept(f);
          onFix(f);
        }, 8000);
        return () => clearInterval(id);
      }
      if (!("geolocation" in navigator)) return () => undefined;
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const f = toFix(pos);
          accept(f);
          onFix(f);
        },
        (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
        { enableHighAccuracy: highAccuracy, maximumAge: 5_000, timeout: 30_000 },
      );
      return () => navigator.geolocation.clearWatch(id);
    },
    [accept, demo],
  );

  // Keep a fresh, low-power position while the app is open, but only if permission was
  // already granted. We never trigger the permission prompt on page load.
  useEffect(() => {
    if (demo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      accept(simulatedFix());
      return;
    }
    if (permission !== "granted") return;
    return track(() => undefined, false);
  }, [accept, demo, permission, track]);

  const value = useMemo<LocationValue>(
    () => ({ fix, lastKnown, status, permission: demo ? "granted" : permission, demo, requestFix, track }),
    [fix, lastKnown, status, permission, demo, requestFix, track],
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used inside <LocationProvider>");
  return ctx;
}
