import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { POST as cancelRoute } from "@/app/api/emergency/cancel/route";
import { POST as locationRoute } from "@/app/api/emergency/location/route";
import { GET as statusRoute } from "@/app/api/emergency/status/route";
import { POST as triggerRoute } from "@/app/api/emergency/trigger/route";
import { GET as publicRoute } from "@/app/api/public/emergency/[token]/route";
import { getRepository } from "@/lib/db";
import { call, fakeProviders, makeContact, makeSession, makeUser } from "./helpers";

async function setup() {
  const user = await makeUser();
  const token = await makeSession(user);
  const mom = await makeContact(user, { name: "Mom", isPrimary: true });
  const sis = await makeContact(user, { name: "Sister", phone: "+919811111111", email: null, relationship: "sister" });
  return { user, token, mom, sis };
}

const tokenFromUrl = (url: string) => url.split("/emergency/")[1]!;

describe("emergency creation", () => {
  it("creates the event, stores the first location and notifies every contact at once", async () => {
    const sent = fakeProviders();
    const { user, token } = await setup();
    const clientEventId = randomUUID();
    const res = await call<{ eventId: string; shareUrl: string; created: boolean }>(triggerRoute, "/api/emergency/trigger", {
      token,
      body: { clientEventId, method: "hold", location: { lat: 20.2961, lng: 85.8245, accuracy: 12 }, batteryLevel: 0.42 },
    });
    expect(res.status).toBe(201);
    expect(res.data.created).toBe(true);
    expect(res.data.shareUrl).toMatch(/\/emergency\/[A-Za-z0-9_-]{43}$/);

    const repo = getRepository();
    const event = await repo.getEmergency(user.id, res.data.eventId);
    expect(event).toMatchObject({ status: "active", triggerMethod: "hold", startLat: 20.2961, batteryLevel: 0.42, isDemo: false });
    expect((await repo.getLatestLocation(res.data.eventId))?.accuracy).toBe(12);

    // Mom: SMS + email. Sister: SMS only (no email). Push requires an opted-in device.
    expect(sent.sms.map((m) => m.to).sort()).toEqual(["+919811111111", "+919876543210"]);
    expect(sent.email.map((m) => m.to)).toEqual(["meera@raksha.test"]);
    expect(sent.sms[0]!.body).toContain("EMERGENCY ALERT: Ananya Test may need help");
    // Each contact gets their own revocable link; raw tokens are never stored.
    const links = sent.sms.map((m) => m.vars.link);
    expect(new Set(links).size).toBe(2);
    const shares = await repo.listShares(res.data.eventId);
    expect(shares.every((s) => !links.some((l) => l.includes(s.tokenHash)))).toBe(true);
    const notes = await repo.listNotifications({ eventId: res.data.eventId });
    expect(notes.every((n) => n.status === "sent")).toBe(true);
  });

  it("is idempotent: retrying the same press never creates a second emergency or re-alerts", async () => {
    const sent = fakeProviders();
    const { token } = await setup();
    const body = { clientEventId: randomUUID(), method: "hold" };
    const first = await call<{ eventId: string }>(triggerRoute, "/api/emergency/trigger", { token, body });
    const second = await call<{ eventId: string; created: boolean }>(triggerRoute, "/api/emergency/trigger", { token, body });
    expect(second.status).toBe(200);
    expect(second.data.created).toBe(false);
    expect(second.data.eventId).toBe(first.data.eventId);
    expect(sent.sms).toHaveLength(2);
  });

  it("a second SOS while one is active joins the active emergency", async () => {
    fakeProviders();
    const { token } = await setup();
    const a = await call<{ eventId: string }>(triggerRoute, "/api/emergency/trigger", { token, body: { clientEventId: randomUUID() } });
    const b = await call<{ eventId: string; created: boolean }>(triggerRoute, "/api/emergency/trigger", { token, body: { clientEventId: randomUUID() } });
    expect(b.data.eventId).toBe(a.data.eventId);
    expect(b.data.created).toBe(false);
  });

  it("works without a location (GPS unavailable) and accepts it later", async () => {
    fakeProviders();
    const { token } = await setup();
    const t = await call<{ eventId: string }>(triggerRoute, "/api/emergency/trigger", { token, body: { clientEventId: randomUUID(), location: null } });
    expect(t.status).toBe(201);
    const loc = await call(locationRoute, "/api/emergency/location", {
      token,
      body: { eventId: t.data.eventId, locations: [{ lat: 19.07, lng: 72.87, accuracy: 30 }] },
    });
    expect(loc.status).toBe(200);
    const status = await call<{ emergency: { event: { startLat: number }; latestLocation: { lat: number } } }>(statusRoute, "/api/emergency/status", { token });
    expect(status.data.emergency.latestLocation.lat).toBe(19.07);
    expect(status.data.emergency.event.startLat).toBe(19.07);
  });

  it("uses simulated locations in demo mode, never the real one", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    const { token, user } = await setup();
    const t = await call<{ eventId: string }>(triggerRoute, "/api/emergency/trigger", {
      token,
      body: { clientEventId: randomUUID(), location: { lat: 28.61, lng: 77.2, accuracy: 5 } },
    });
    const event = await getRepository().getEmergency(user.id, t.data.eventId);
    expect(event!.isDemo).toBe(true);
    expect(Math.abs(event!.startLat! - 28.61)).toBeGreaterThan(1);
    const notes = await getRepository().listNotifications({ eventId: t.data.eventId });
    expect(notes.every((n) => n.status === "simulated")).toBe(true);
  });
});

describe("location updates", () => {
  it("accepts batched offline points and clamps device timestamps", async () => {
    fakeProviders();
    const { token, user } = await setup();
    const t = await call<{ eventId: string }>(triggerRoute, "/api/emergency/trigger", { token, body: { clientEventId: randomUUID() } });
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const res = await call<{ stored: number }>(locationRoute, "/api/emergency/location", {
      token,
      body: {
        eventId: t.data.eventId,
        locations: [
          { lat: 20.1, lng: 85.1, recordedAt: new Date(Date.now() - 20_000).toISOString() },
          { lat: 20.2, lng: 85.2, recordedAt: future },
        ],
      },
    });
    expect(res.data.stored).toBe(2);
    const latest = await getRepository().getLatestLocation(t.data.eventId);
    expect(latest!.lat).toBe(20.2);
    expect(new Date(latest!.recordedAt).getTime()).toBeLessThanOrEqual(Date.now() + 61_000);
    expect(await getRepository().countLocations(t.data.eventId)).toBe(2);
    expect(user.id).toBeTruthy();
  });

  it("rejects updates for an ended emergency", async () => {
    fakeProviders();
    const { token } = await setup();
    const t = await call<{ eventId: string }>(triggerRoute, "/api/emergency/trigger", { token, body: { clientEventId: randomUUID() } });
    await call(cancelRoute, "/api/emergency/cancel", { token, body: { eventId: t.data.eventId, reason: "safe" } });
    const res = await call(locationRoute, "/api/emergency/location", { token, body: { eventId: t.data.eventId, locations: [{ lat: 1, lng: 1 }] } });
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ success: false, error: { code: "EMERGENCY_NOT_ACTIVE" } });
  });
});

describe("emergency cancellation", () => {
  it("resolves, stops location sharing and tells every alerted contact she is safe", async () => {
    const sent = fakeProviders();
    const { token } = await setup();
    const t = await call<{ eventId: string; shareUrl: string }>(triggerRoute, "/api/emergency/trigger", {
      token,
      body: { clientEventId: randomUUID(), location: { lat: 20, lng: 85 } },
    });
    sent.sms.length = 0;
    const res = await call<{ status: string }>(cancelRoute, "/api/emergency/cancel", { token, body: { eventId: t.data.eventId, reason: "safe" } });
    expect(res.data.status).toBe("resolved");
    expect(sent.sms).toHaveLength(2);
    expect(sent.sms[0]!.body).toContain("marked herself safe");

    // The contact's link now shows "resolved" with no location.
    const view = await call<{ status: string; location: unknown; locationSharingActive: boolean }>(publicRoute, "/api/public/emergency/x", {
      params: { token: tokenFromUrl(t.data.shareUrl) },
    });
    expect(view.status).toBe(200);
    expect(view.data).toMatchObject({ status: "resolved", location: null, locationSharingActive: false });
  });

  it("'triggered by mistake' marks the event cancelled", async () => {
    fakeProviders();
    const { token } = await setup();
    const t = await call<{ eventId: string }>(triggerRoute, "/api/emergency/trigger", { token, body: { clientEventId: randomUUID() } });
    const res = await call<{ status: string }>(cancelRoute, "/api/emergency/cancel", { token, body: { eventId: t.data.eventId, reason: "mistake" } });
    expect(res.data.status).toBe("cancelled");
  });

  it("can cancel by clientEventId when the trigger response was lost", async () => {
    fakeProviders();
    const { token } = await setup();
    const clientEventId = randomUUID();
    await call(triggerRoute, "/api/emergency/trigger", { token, body: { clientEventId } });
    const res = await call<{ status: string; neverSent: boolean }>(cancelRoute, "/api/emergency/cancel", { token, body: { clientEventId, reason: "mistake" } });
    expect(res.data).toMatchObject({ status: "cancelled", neverSent: false });
  });

  it("reports neverSent when the alert never reached the server", async () => {
    const { token } = await setup();
    const res = await call<{ neverSent: boolean }>(cancelRoute, "/api/emergency/cancel", { token, body: { clientEventId: randomUUID(), reason: "mistake" } });
    expect(res.data.neverSent).toBe(true);
  });
});
