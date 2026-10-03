"use client";

import { useEffect } from "react";
import { serviceWorkerEnabled } from "@/lib/push/client";

/**
 * Registers the service worker (offline fallback, emergency page caching, push).
 * Disabled in development unless NEXT_PUBLIC_ENABLE_SW=true, so HMR is not served stale.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!serviceWorkerEnabled()) {
      // Remove a worker left over from an earlier production build on this origin.
      void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
      return;
    }
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
