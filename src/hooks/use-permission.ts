"use client";

import { useCallback, useEffect, useState } from "react";

export type PermissionKind = "geolocation" | "notifications" | "microphone";
export type PermissionValue = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

function supported(kind: PermissionKind): boolean {
  if (typeof window === "undefined") return false;
  if (kind === "geolocation") return "geolocation" in navigator;
  if (kind === "notifications") return "Notification" in window && "serviceWorker" in navigator;
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

/**
 * Reads permission state without prompting. Prompts happen only from explicit user actions
 * (onboarding buttons, SOS, "Start recording"), never on page load.
 */
export function usePermission(kind: PermissionKind) {
  const [state, setState] = useState<PermissionValue>("unknown");

  const refresh = useCallback(async () => {
    if (!supported(kind)) return setState("unsupported");
    if (kind === "notifications") return setState(Notification.permission === "default" ? "prompt" : Notification.permission);
    try {
      const status = await navigator.permissions.query({ name: kind as PermissionName });
      setState(status.state as PermissionValue);
      status.onchange = () => setState(status.state as PermissionValue);
    } catch {
      // Safari < 16 and some WebViews cannot query; treat as "ask when needed".
      setState("prompt");
    }
  }, [kind]);

  useEffect(() => {
    // Permission state comes from a browser API that is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return { state, refresh };
}

export async function requestMicrophone(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}
