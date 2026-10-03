import { describe, expect, it, vi } from "vitest";
import { Outbox, type OutboxItem } from "@/lib/offline/outbox";
import { MemoryStorage } from "@/lib/offline/storage";

function setup() {
  let now = 1_000_000;
  const storage = new MemoryStorage();
  const outbox = new Outbox(storage, () => now);
  return { outbox, storage, advance: (ms: number) => (now += ms) };
}

const trigger = (id = "t1") => ({ id, kind: "trigger" as const, url: "/api/emergency/trigger", body: { clientEventId: id } });
const point = (id: string) => ({ id, kind: "location" as const, url: "/api/emergency/location", body: { locations: [{ lat: 1, lng: 1 }] } });

describe("offline queue", () => {
  it("persists items so an alert survives a reload", () => {
    const { outbox, storage } = setup();
    outbox.enqueue(trigger());
    const reloaded = new Outbox(storage);
    expect(reloaded.items().map((i) => i.id)).toEqual(["t1"]);
  });

  it("puts the SOS trigger ahead of queued location points", () => {
    const { outbox } = setup();
    outbox.enqueue(point("p1"));
    outbox.enqueue(trigger());
    expect(outbox.items().map((i) => i.kind)).toEqual(["trigger", "location"]);
  });

  it("delivers in order and stops at the first retryable failure", async () => {
    const { outbox } = setup();
    outbox.enqueue(trigger());
    outbox.enqueue(point("p1"));
    const seen: string[] = [];
    const delivered = await outbox.flush(async (item: OutboxItem) => {
      seen.push(item.id);
      return "retry";
    });
    expect(delivered).toBe(0);
    expect(seen).toEqual(["t1"]); // the location point never jumps ahead of the trigger
    expect(outbox.items()[0]!.attempts).toBe(1);
  });

  it("backs off between retries, then delivers when the network returns", async () => {
    const { outbox, advance } = setup();
    outbox.enqueue(trigger());
    const send = vi.fn().mockResolvedValueOnce("retry").mockResolvedValue("ok");
    await outbox.flush(send);
    await outbox.flush(send); // still backing off
    expect(send).toHaveBeenCalledTimes(1);
    advance(2_001);
    expect(await outbox.flush(send)).toBe(1);
    expect(outbox.pending()).toBe(0);
  });

  it("treats a thrown network error as retryable", async () => {
    const { outbox } = setup();
    outbox.enqueue(trigger());
    await outbox.flush(async () => {
      throw new Error("Failed to fetch");
    });
    expect(outbox.items()[0]).toMatchObject({ attempts: 1, lastError: "Failed to fetch" });
  });

  it("drops permanently rejected items", async () => {
    const { outbox } = setup();
    outbox.enqueue(point("p1"));
    await outbox.flush(async () => "drop");
    expect(outbox.pending()).toBe(0);
  });

  it("regression: flushing an empty queue does not wedge later flushes", async () => {
    const { outbox } = setup();
    await outbox.flush(async () => "ok"); // completes synchronously
    outbox.enqueue(trigger());
    const send = vi.fn().mockResolvedValue("ok");
    expect(await outbox.flush(send)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("concurrent flush calls share one run (no duplicate sends)", async () => {
    const { outbox } = setup();
    outbox.enqueue(trigger());
    let resolve!: (v: "ok") => void;
    const send = vi.fn(() => new Promise<"ok">((r) => (resolve = r)));
    const a = outbox.flush(send);
    const b = outbox.flush(send);
    resolve("ok");
    expect(await a).toBe(1);
    expect(await b).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("items enqueued during a run are sent right after it, not on the next retry tick", async () => {
    const { outbox } = setup();
    outbox.enqueue(trigger());
    const seen: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const send = vi.fn(async (item: OutboxItem) => {
      seen.push(item.id);
      if (item.id === "t1") await gate;
      return "ok" as const;
    });
    const first = outbox.flush(send);
    outbox.enqueue({ id: "c1", kind: "cancel", url: "/api/emergency/cancel", body: {} });
    void outbox.flush(send); // joins the running pass and requests another
    release();
    await first;
    await vi.waitFor(() => expect(seen).toEqual(["t1", "c1"]));
    expect(outbox.pending()).toBe(0);
  });

  it("never evicts a trigger when the queue overflows", () => {
    const { outbox } = setup();
    outbox.enqueue(trigger());
    for (let i = 0; i < 520; i++) outbox.enqueue(point(`p${i}`));
    const items = outbox.items();
    expect(items.length).toBe(500);
    expect(items[0]!.kind).toBe("trigger");
  });
});
