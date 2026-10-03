import { readJson, writeJson, type KeyValueStorage } from "./storage";

/**
 * Durable retry queue for emergency requests. Every item is persisted before the first send,
 * so an SOS pressed with no signal survives a page reload and is delivered when the network
 * returns. Items are processed in order; a request is idempotent server-side (clientEventId),
 * so a duplicate delivery after a lost response is harmless.
 */
export type OutboxKind = "trigger" | "location" | "cancel" | "checkin" | "journey";

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  url: string;
  method: "POST";
  body: unknown;
  createdAt: number;
  attempts: number;
  /** Earliest time for the next attempt (exponential backoff). */
  nextAttemptAt: number;
  lastError?: string;
}

export type SendOutcome = "ok" | "retry" | "drop";
export type Sender = (item: OutboxItem) => Promise<SendOutcome>;

const KEY = "raksha.outbox.v1";
const MAX_ITEMS = 500;
const BACKOFF_MS = [0, 2_000, 5_000, 10_000, 20_000, 30_000];

export class Outbox {
  private flushing: Promise<number> | null = null;
  /** Set when flush() is called during a run: the run is followed by another pass. */
  private rerun: Sender | null = null;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly now: () => number = Date.now,
  ) {}

  items(): OutboxItem[] {
    return readJson<OutboxItem[]>(this.storage, KEY, []);
  }

  private save(items: OutboxItem[]) {
    // Never drop a trigger to make room; trim the oldest location points instead.
    let next = items;
    while (next.length > MAX_ITEMS) {
      const idx = next.findIndex((i) => i.kind === "location");
      if (idx === -1) break;
      next = [...next.slice(0, idx), ...next.slice(idx + 1)];
    }
    writeJson(this.storage, KEY, next);
  }

  enqueue(item: Omit<OutboxItem, "attempts" | "createdAt" | "nextAttemptAt" | "method"> & { method?: "POST" }): OutboxItem {
    const full: OutboxItem = { method: "POST", ...item, attempts: 0, createdAt: this.now(), nextAttemptAt: this.now() };
    const items = this.items().filter((i) => i.id !== full.id);
    // Triggers jump the queue: the alert matters more than queued location points.
    const next = full.kind === "trigger" ? [full, ...items] : [...items, full];
    this.save(next);
    return full;
  }

  remove(id: string) {
    this.save(this.items().filter((i) => i.id !== id));
  }

  pending(kind?: OutboxKind): number {
    return this.items().filter((i) => !kind || i.kind === kind).length;
  }

  clear(kind?: OutboxKind) {
    this.save(kind ? this.items().filter((i) => i.kind !== kind) : []);
  }

  /**
   * Sends due items in order. Stops at the first retryable failure to preserve ordering
   * (a trigger must reach the server before its location updates). Returns items delivered.
   */
  flush(send: Sender): Promise<number> {
    if (this.flushing) {
      // Something was enqueued mid-run (e.g. a cancel behind a location point): run again
      // as soon as this pass ends instead of waiting for the next retry tick.
      this.rerun = send;
      return this.flushing;
    }
    const run = async () => {
      let delivered = 0;
      for (const item of this.items()) {
        if (item.nextAttemptAt > this.now()) break;
        let outcome: SendOutcome;
        try {
          outcome = await send(item);
        } catch (err) {
          outcome = "retry";
          item.lastError = err instanceof Error ? err.message : String(err);
        }
        if (outcome === "ok" || outcome === "drop") {
          this.remove(item.id);
          if (outcome === "ok") delivered++;
          continue;
        }
        const attempts = item.attempts + 1;
        const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)]!;
        this.save(this.items().map((i) => (i.id === item.id ? { ...i, attempts, nextAttemptAt: this.now() + delay, lastError: item.lastError } : i)));
        break;
      }
      return delivered;
    };
    // Clear the in-flight marker only after it has been assigned: a run that finishes
    // synchronously (empty queue) must not leave a stale promise behind.
    const promise: Promise<number> = run().finally(() => {
      if (this.flushing === promise) this.flushing = null;
      const again = this.rerun;
      this.rerun = null;
      if (again) void this.flush(again);
    });
    this.flushing = promise;
    return promise;
  }
}
