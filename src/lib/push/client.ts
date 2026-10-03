"use client";

import { api } from "@/lib/api/client";

export type PushSupport = "supported" | "unsupported" | "ios-needs-install";

/**
 * The service worker runs in production, or in development only when explicitly enabled:
 * under `next dev` chunk names are not content-hashed, so a caching worker would serve stale code.
 */
export function serviceWorkerEnabled(): boolean {
  return process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "true";
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !serviceWorkerEnabled()) return "unsupported";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iOS only supports web push for PWAs added to the home screen (iOS 16.4+).
    return ios && !standalone ? "ios-needs-install" : "unsupported";
  }
  return "supported";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  try {
    return await (await registration()).pushManager.getSubscription();
  } catch {
    return null;
  }
}

export type SubscribeResult = "subscribed" | "denied" | "unsupported" | "not-configured" | "error";

/**
 * Asks for notification permission (from a user gesture only) and registers this device.
 * `endpoint` is /api/push/subscribe for the user, or /api/public/alerts/<token> for a contact.
 */
export async function subscribeToPush(endpoint: string): Promise<SubscribeResult> {
  if (pushSupport() !== "supported") return "unsupported";
  const { publicKey, configured, demoMode } = await api<{ publicKey: string | null; configured: boolean; demoMode: boolean }>("/api/push/public-key");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  if (!configured || !publicKey) return demoMode ? "subscribed" : "not-configured";
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await api(endpoint, { body: { endpoint: json.endpoint, keys: json.keys } });
    return "subscribed";
  } catch {
    return "error";
  }
}

/** Shows a local notification (e.g. check-in timer ran out while the app is open). */
export async function showLocalNotification(title: string, body: string, url = "/app") {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker?.getRegistration("/");
    if (reg) {
      await reg.showNotification(title, { body, tag: "raksha-local", data: { url }, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png" });
    } else {
      new Notification(title, { body });
    }
    return true;
  } catch {
    return false;
  }
}
