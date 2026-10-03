import { describe, expect, it, vi } from "vitest";
import { POST as checkinComplete } from "@/app/api/checkin/complete/route";
import { POST as checkinStart } from "@/app/api/checkin/route";
import { POST as journeyComplete } from "@/app/api/journey/complete/route";
import { POST as journeyStart } from "@/app/api/journey/start/route";
import { getRepository } from "@/lib/db";
import { processDue } from "@/lib/scheduler";
import type { CheckIn, SafeJourney } from "@/types";
import { call, fakeProviders, makeContact, makeSession, makeUser } from "./helpers";

const MIN = 60_000;

async function setup() {
  const user = await makeUser();
  const token = await makeSession(user);
  const mom = await makeContact(user, { name: "Mom", isPrimary: true });
  const friend = await makeContact(user, { name: "Friend", phone: "+919822222222", email: null, relationship: "friend" });
  // The user's own phone, for reminders.
  await getRepository().upsertPushSubscription({ userId: user.id, contactId: null, endpoint: "https://push.example/me", p256dh: "p".repeat(20), auth: "a".repeat(12) });
  return { user, token, mom, friend };
}

describe("safety check-in escalation", () => {
  it("reminds her at the due time, then notifies contacts after the grace period", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = new Date("2026-10-03T18:00:00Z").getTime();
    vi.setSystemTime(t0);
    const sent = fakeProviders();
    const { token, user } = await setup();
    const res = await call<{ checkIn: CheckIn }>(checkinStart, "/api/checkin", { token, body: { minutes: 30, location: { lat: 20.3, lng: 85.8 } } });
    expect(res.status).toBe(201);

    await processDue(t0 + 29 * MIN);
    expect(sent.push).toHaveLength(0);

    vi.setSystemTime(t0 + 30 * MIN);
    await processDue(t0 + 30 * MIN);
    expect(sent.push).toHaveLength(1); // reminder to her own phone
    expect(sent.push[0]!.message.title).toBe("Time to check in");
    expect(sent.sms).toHaveLength(0); // contacts not yet

    vi.setSystemTime(t0 + 41 * MIN); // default grace: 10 minutes
    await processDue(t0 + 41 * MIN);
    expect(sent.sms.map((m) => m.to).sort()).toEqual(["+919822222222", "+919876543210"]);
    expect(sent.sms[0]!.body).toContain("has not completed her scheduled safety check-in");
    const checkIn = await getRepository().getCheckIn(user.id, res.data.checkIn.id);
    expect(checkIn).toMatchObject({ status: "escalated" });
    expect(checkIn!.eventId).toBeTruthy();

    // Escalating twice is impossible.
    await processDue(t0 + 50 * MIN);
    expect(sent.sms).toHaveLength(2);
  });

  it("checking in on time prevents any escalation", async () => {
    const sent = fakeProviders();
    const { token } = await setup();
    const res = await call<{ checkIn: CheckIn }>(checkinStart, "/api/checkin", { token, body: { minutes: 15 } });
    await call(checkinComplete, "/api/checkin/complete", { token, body: { checkInId: res.data.checkIn.id, action: "complete" } });
    await processDue(Date.now() + 60 * MIN);
    expect(sent.sms).toHaveLength(0);
  });

  it("a late 'I'm safe' resolves the escalation and tells contacts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.now();
    const sent = fakeProviders();
    const { token, user } = await setup();
    const res = await call<{ checkIn: CheckIn }>(checkinStart, "/api/checkin", { token, body: { minutes: 5 } });
    vi.setSystemTime(t0 + 30 * MIN);
    await processDue(t0 + 30 * MIN);
    sent.sms.length = 0;
    await call(checkinComplete, "/api/checkin/complete", { token, body: { checkInId: res.data.checkIn.id, action: "complete" } });
    const event = await getRepository().getActiveEmergency(user.id);
    expect(event).toBeNull();
    expect(sent.sms.some((m) => m.body.includes("marked herself safe"))).toBe(true);
  });

  it("extending pushes the due time and re-arms the reminder", async () => {
    fakeProviders();
    const { token } = await setup();
    const res = await call<{ checkIn: CheckIn }>(checkinStart, "/api/checkin", { token, body: { minutes: 10 } });
    const ext = await call<{ checkIn: CheckIn }>(checkinComplete, "/api/checkin/complete", { token, body: { checkInId: res.data.checkIn.id, action: "extend", extendMinutes: 15 } });
    expect(new Date(ext.data.checkIn.dueAt).getTime() - new Date(res.data.checkIn.dueAt).getTime()).toBe(15 * MIN);
  });

  it("only one check-in can run at a time", async () => {
    const { token } = await setup();
    await call(checkinStart, "/api/checkin", { token, body: { minutes: 10 } });
    const second = await call(checkinStart, "/api/checkin", { token, body: { minutes: 10 } });
    expect(second.status).toBe(409);
  });
});

describe("safe journey", () => {
  it("validates input: future arrival and her own contacts only", async () => {
    const { token } = await setup();
    const other = await makeContact(await makeUser());
    const past = await call(journeyStart, "/api/journey/start", {
      token,
      body: { destinationLabel: "Home", expectedArrivalAt: new Date(Date.now() - MIN).toISOString(), contactIds: [other.id] },
    });
    expect(past.status).toBe(400);
    const foreign = await call(journeyStart, "/api/journey/start", {
      token,
      body: { destinationLabel: "Home", expectedArrivalAt: new Date(Date.now() + 30 * MIN).toISOString(), contactIds: [other.id] },
    });
    expect(foreign.status).toBe(409);
    expect(foreign.json).toMatchObject({ error: { code: "NO_CONTACTS" } });
  });

  it("completing the journey on time means nobody is alerted", async () => {
    const sent = fakeProviders();
    const { token, mom } = await setup();
    const j = await call<{ journey: SafeJourney }>(journeyStart, "/api/journey/start", {
      token,
      body: { destinationLabel: "Home", expectedArrivalAt: new Date(Date.now() + 20 * MIN).toISOString(), graceMinutes: 10, contactIds: [mom.id] },
    });
    expect(j.status).toBe(201);
    const done = await call<{ journey: SafeJourney }>(journeyComplete, "/api/journey/complete", { token, body: { journeyId: j.data.journey.id, action: "arrived" } });
    expect(done.data.journey.status).toBe("completed");
    await processDue(Date.now() + 120 * MIN);
    expect(sent.sms).toHaveLength(0);
  });

  it("an overdue journey alerts only the chosen contacts, never the police", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.now();
    const sent = fakeProviders();
    const { token, mom, user } = await setup();
    await call(journeyStart, "/api/journey/start", {
      token,
      body: { destinationLabel: "Patia", expectedArrivalAt: new Date(t0 + 20 * MIN).toISOString(), graceMinutes: 10, contactIds: [mom.id] },
    });
    vi.setSystemTime(t0 + 21 * MIN);
    await processDue(t0 + 21 * MIN);
    expect(sent.sms).toHaveLength(0); // within grace: reminder only
    expect(sent.push[0]!.message.title).toBe("Have you arrived?");
    vi.setSystemTime(t0 + 31 * MIN);
    await processDue(t0 + 31 * MIN);
    expect(sent.sms.map((m) => m.to)).toEqual(["+919876543210"]);
    expect(sent.sms[0]!.body).toContain("has not arrived at Patia");
    const journey = (await getRepository().listJourneys(user.id, 1))[0]!;
    expect(journey.status).toBe("escalated");
  });
});
