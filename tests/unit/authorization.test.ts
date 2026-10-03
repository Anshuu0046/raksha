import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GET as adminStats } from "@/app/api/admin/stats/route";
import { PUT as adminHelplines } from "@/app/api/admin/helplines/route";
import { DELETE as deleteContact, PATCH as patchContact } from "@/app/api/contacts/[id]/route";
import { GET as listContacts, POST as createContact } from "@/app/api/contacts/route";
import { POST as cancelRoute } from "@/app/api/emergency/cancel/route";
import { POST as locationRoute } from "@/app/api/emergency/location/route";
import { GET as statusRoute } from "@/app/api/emergency/status/route";
import { POST as triggerRoute } from "@/app/api/emergency/trigger/route";
import { GET as historyRoute } from "@/app/api/history/route";
import { getRepository } from "@/lib/db";
import { call, fakeProviders, makeContact, makeSession, makeUser } from "./helpers";

async function twoUsers() {
  const alice = await makeUser({ name: "Alice" });
  const bob = await makeUser({ name: "Bob" });
  return { alice, bob, aliceToken: await makeSession(alice), bobToken: await makeSession(bob) };
}

describe("authorization", () => {
  it("every private endpoint requires a session", async () => {
    for (const [handler, path, method] of [
      [listContacts, "/api/contacts", "GET"],
      [statusRoute, "/api/emergency/status", "GET"],
      [historyRoute, "/api/history", "GET"],
      [triggerRoute, "/api/emergency/trigger", "POST"],
    ] as const) {
      const res = await call(handler as never, path, { method, body: method === "POST" ? { clientEventId: randomUUID() } : undefined });
      expect(res.status, path).toBe(401);
    }
  });

  it("users can never read or change another user's contacts", async () => {
    const { alice, aliceToken, bobToken } = await twoUsers();
    const contact = await makeContact(alice);
    const bobList = await call<{ contacts: unknown[] }>(listContacts, "/api/contacts", { token: bobToken });
    expect(bobList.data.contacts).toHaveLength(0);
    const edit = await call(patchContact, `/api/contacts/${contact.id}`, { method: "PATCH", token: bobToken, params: { id: contact.id }, body: { name: "Hacked" } });
    expect(edit.status).toBe(404);
    const del = await call(deleteContact, `/api/contacts/${contact.id}`, { method: "DELETE", token: bobToken, params: { id: contact.id } });
    expect(del.status).toBe(404);
    expect((await getRepository().getContact(alice.id, contact.id))!.name).toBe("Meera Test");
    const own = await call<{ contacts: unknown[] }>(listContacts, "/api/contacts", { token: aliceToken });
    expect(own.data.contacts).toHaveLength(1);
  });

  it("users cannot see, update or cancel another user's emergency", async () => {
    fakeProviders();
    const { aliceToken, bobToken } = await twoUsers();
    const t = await call<{ eventId: string }>(triggerRoute, "/api/emergency/trigger", { token: aliceToken, body: { clientEventId: randomUUID() } });
    const status = await call<{ emergency: unknown }>(statusRoute, "/api/emergency/status", { token: bobToken, query: { eventId: t.data.eventId } });
    expect(status.data.emergency).toBeNull();
    const loc = await call(locationRoute, "/api/emergency/location", { token: bobToken, body: { eventId: t.data.eventId, locations: [{ lat: 1, lng: 1 }] } });
    expect(loc.status).toBe(404);
    const cancel = await call(cancelRoute, "/api/emergency/cancel", { token: bobToken, body: { eventId: t.data.eventId, reason: "mistake" } });
    expect(cancel.status).toBe(404);
  });

  it("admin APIs are forbidden to regular users", async () => {
    const { aliceToken } = await twoUsers();
    expect((await call(adminStats, "/api/admin/stats", { token: aliceToken })).status).toBe(403);
    const put = await call(adminHelplines, "/api/admin/helplines", {
      method: "PUT",
      token: aliceToken,
      body: { id: "x-1", region: "IN", name: "Fake", purpose: "Fake line", number: "999", category: "other" },
    });
    expect(put.status).toBe(403);
  });

  it("admin stats expose aggregates only: no coordinates, names or contacts", async () => {
    fakeProviders();
    const admin = await makeUser({ role: "admin" });
    const { aliceToken } = await twoUsers();
    await call(triggerRoute, "/api/emergency/trigger", { token: aliceToken, body: { clientEventId: randomUUID(), location: { lat: 12.97, lng: 77.59 } } });
    const res = await call(adminStats, "/api/admin/stats", { token: await makeSession(admin) });
    const body = JSON.stringify(res.json);
    expect(res.status).toBe(200);
    expect(body).not.toContain("12.97");
    expect(body).not.toContain("Alice");
    expect(body).not.toContain("raksha.test");
  });

  it("rejects cross-site cookie requests (CSRF) but allows bearer clients", async () => {
    const { aliceToken } = await twoUsers();
    const evil = await call(createContact, "/api/contacts", {
      token: aliceToken,
      headers: { origin: "https://evil.example" },
      body: { name: "X", phone: "9876543210", relationship: "friend" },
    });
    expect(evil.status).toBe(403);
    expect(evil.json).toMatchObject({ error: { code: "CSRF_REJECTED" } });
    const android = await call(createContact, "/api/contacts", {
      bearer: aliceToken,
      headers: { origin: "https://evil.example" },
      body: { name: "X", phone: "9876543210", relationship: "friend" },
    });
    expect(android.status).toBe(201);
  });
});
