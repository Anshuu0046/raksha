import { processSafetyTimers } from "@/lib/emergency/safety-timers";
import { processDueNotifications } from "@/lib/notifications/dispatcher";
import { runInBackground } from "@/lib/server/background";

/**
 * One scheduler tick: escalate missed check-ins / overdue journeys, then retry notifications.
 * Driven by Vercel Cron (/api/cron/process, every minute) and, as a safety net, opportunistically
 * by user traffic (see maybeProcess). Every step is idempotent and lease-protected.
 */
export async function processDue(now = Date.now()) {
  const timers = await processSafetyTimers(now);
  const notifications = await processDueNotifications();
  return { ...timers, notificationsProcessed: notifications, at: new Date(now).toISOString() };
}

let lastRun = 0;
const OPPORTUNISTIC_INTERVAL_MS = 30_000;

/** Called from frequently-hit endpoints so escalation still happens if cron is delayed. */
export function maybeProcess() {
  const now = Date.now();
  if (now - lastRun < OPPORTUNISTIC_INTERVAL_MS) return;
  lastRun = now;
  runInBackground(() => processDue(now));
}
