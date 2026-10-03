import { describe, expect, it, vi } from "vitest";
import { POST as testRoute } from "@/app/api/contacts/[id]/test/route";
import { getRepository } from "@/lib/db";
import { dispatchNotifications, planContactNotifications, processDueNotifications } from "@/lib/notifications/dispatcher";
import { renderMessage } from "@/lib/notifications/templates";
import { call, fakeProviders, makeContact, makeSession, makeUser } from "./helpers";

describe("contact notification", () => {
  it("skips channels a contact cannot receive and respects notification preferences", async () => {
    const user = await makeUser();
    const a = await makeContact(user, { notifyEmail: false });
    const b = await makeContact(user, { phone: null, email: "b@raksha.test" });
    const rows = await planContactNotifications(user, [a, b], "sos", {});
    expect(rows.map((r) => `${r.contactId === a.id ? "a" : "b"}:${r.channel}`).sort()).toEqual(["a:sms", "b:email"]);
    expect(rows.every((r) => r.recipientMasked.includes("•"))).toBe(true);
  });

  it("includes push only when the contact opted a device in", async () => {
    const user = await makeUser();
    const c = await makeContact(user);
    await getRepository().upsertPushSubscription({ userId: null, contactId: c.id, endpoint: "https://push.example/abc", p256dh: "p".repeat(20), auth: "a".repeat(12) });
    const rows = await planContactNotifications(user, [c], "sos", {});
    expect(rows.map((r) => r.channel).sort()).toEqual(["email", "push", "sms"]);
  });

  it("retries transient failures with backoff and gives up after 4 attempts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = new Date("2026-10-03T10:00:00Z").getTime();
    vi.setSystemTime(t0);
    const sent = fakeProviders({ sms: ["failed", "failed", "failed", "failed"] });
    const user = await makeUser();
    const c = await makeContact(user, { email: null });
    const rows = await planContactNotifications(user, [c], "test", {});
    await dispatchNotifications(rows);
    const repo = getRepository();
    let [n] = await repo.listUserNotifications(user.id, 5);
    expect(n).toMatchObject({ status: "failed", attempts: 1 });
    expect(new Date(n!.nextAttemptAt!).getTime()).toBe(t0 + 30_000);

    // Not due yet: nothing is resent.
    expect(await processDueNotifications()).toBe(0);
    for (const step of [30_000, 120_000, 600_000]) {
      vi.setSystemTime(new Date(n!.nextAttemptAt!).getTime() + 1);
      await processDueNotifications();
      [n] = await repo.listUserNotifications(user.id, 5);
      expect(step).toBeGreaterThan(0);
    }
    expect(n).toMatchObject({ status: "failed", attempts: 4, nextAttemptAt: null });
    expect(sent.sms).toHaveLength(4);
  });

  it("never double-sends when two workers dispatch the same rows concurrently", async () => {
    const sent = fakeProviders();
    const user = await makeUser();
    const c = await makeContact(user, { email: null });
    const rows = await planContactNotifications(user, [c], "test", {});
    await Promise.all([dispatchNotifications(rows), dispatchNotifications(rows), processDueNotifications()]);
    expect(sent.sms).toHaveLength(1);
  });

  it("does not retry permanent failures (provider not configured)", async () => {
    const user = await makeUser();
    const c = await makeContact(user, { email: null });
    const rows = await planContactNotifications(user, [c], "test", {});
    await dispatchNotifications(rows); // no providers configured outside demo mode
    const [n] = await getRepository().listUserNotifications(user.id, 5);
    expect(n).toMatchObject({ status: "skipped", nextAttemptAt: null });
  });

  it("test notification endpoint reports per-channel results and includes the push invite link", async () => {
    const sent = fakeProviders();
    const user = await makeUser();
    const token = await makeSession(user);
    const c = await makeContact(user);
    const res = await call<{ results: Array<{ channel: string; status: string }> }>(testRoute, `/api/contacts/${c.id}/test`, { method: "POST", token, params: { id: c.id } });
    expect(res.status).toBe(200);
    expect(res.data.results.map((r) => `${r.channel}:${r.status}`).sort()).toEqual(["email:sent", "sms:sent"]);
    expect(sent.sms[0]!.body).toMatch(/\/alerts\/[A-Za-z0-9_-]+/);
    const updated = await getRepository().getContact(user.id, c.id);
    expect(updated!.alertTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("message templates", () => {
  it("renders the SOS alert in the contact's language with the secure link", async () => {
    const hi = await renderMessage({ kind: "sos", locale: "hi", userName: "Ananya", userPhone: "+919000000001", link: "https://raksha.app/emergency/abc", at: new Date().toISOString() });
    expect(hi.sms.body).toContain("Ananya");
    expect(hi.sms.body).toContain("https://raksha.app/emergency/abc");
    const en = await renderMessage({ kind: "sos", locale: "en", userName: "Ananya", userPhone: null, link: "https://x/emergency/abc", at: new Date().toISOString(), battery: 0.31, location: { lat: 20, lng: 85, accuracy: 10 } });
    expect(en.push.title).toBe("Emergency alert from Ananya");
    expect(en.email.html).toContain("31%");
    expect(en.email.html).toContain("google.com/maps");
    expect(en.push.urgent).toBe(true);
  });

  it("escapes user-controlled text in emails", async () => {
    const m = await renderMessage({ kind: "sos", locale: "en", userName: "<script>x</script>", userPhone: null, link: "https://x/e/1", at: new Date().toISOString() });
    expect(m.email.html).not.toContain("<script>");
    expect(m.email.html).toContain("&lt;script&gt;");
  });
});
