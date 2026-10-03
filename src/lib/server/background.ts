import { after } from "next/server";

/**
 * Runs work after the response is sent (Next.js `after`, which Vercel keeps alive via waitUntil).
 * Outside a request scope (tests, scripts) it runs immediately and is tracked so tests can await it.
 */
const pending = new Set<Promise<unknown>>();

function track(task: () => Promise<unknown>) {
  const p = task().catch((err) =>
    console.error("[raksha] background task failed:", err instanceof Error ? err.message : err),
  );
  pending.add(p);
  void p.finally(() => pending.delete(p));
  return p;
}

export function runInBackground(task: () => Promise<unknown>) {
  if (process.env.RAKSHA_TEST === "1") {
    track(task);
    return;
  }
  try {
    after(() => track(task));
  } catch {
    // Not inside a request scope (e.g. scheduler script): run now.
    track(task);
  }
}

/** Test helper: wait for all background work to settle. */
export async function flushBackground() {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}
