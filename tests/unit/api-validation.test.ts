import { describe, expect, it } from "vitest";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as contactsRoute } from "@/app/api/contacts/route";
import { POST as triggerRoute } from "@/app/api/emergency/trigger/route";
import { GET as nearbyRoute } from "@/app/api/nearby/route";
import { POST as otpRequestRoute } from "@/app/api/auth/otp/request/route";
import { normalizePhone } from "@/lib/validation";
import { call, makeSession, makeUser } from "./helpers";

describe("API validation", () => {
  it("returns structured errors with field details", async () => {
    const token = await makeSession(await makeUser());
    const res = await call(contactsRoute, "/api/contacts", { token, body: { name: "", relationship: "boss" } });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    const details = (res.json as { error: { details: Array<{ path: string }> } }).error.details;
    expect(details.map((d) => d.path)).toEqual(expect.arrayContaining(["name", "relationship"]));
  });

  it("requires a phone or email for a trusted contact", async () => {
    const token = await makeSession(await makeUser());
    const res = await call(contactsRoute, "/api/contacts", { token, body: { name: "Mom", relationship: "mother" } });
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON without leaking internals", async () => {
    const res = await call(loginRoute, "/api/auth/login", { rawBody: "{not json" });
    expect(res.status).toBe(400);
    expect(res.json).toEqual({ success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } });
  });

  it("rejects oversized bodies", async () => {
    const res = await call(loginRoute, "/api/auth/login", { rawBody: JSON.stringify({ email: "a@b.co", password: "x".repeat(70_000) }) });
    expect(res.status).toBe(413);
  });

  it("validates coordinates and idempotency keys on the SOS endpoint", async () => {
    const token = await makeSession(await makeUser());
    const badId = await call(triggerRoute, "/api/emergency/trigger", { token, body: { clientEventId: "123" } });
    expect(badId.status).toBe(400);
    const badLoc = await call(triggerRoute, "/api/emergency/trigger", {
      token,
      body: { clientEventId: crypto.randomUUID(), location: { lat: 200, lng: 0 } },
    });
    expect(badLoc.status).toBe(400);
  });

  it("validates query parameters", async () => {
    const token = await makeSession(await makeUser());
    const res = await call(nearbyRoute, "/api/nearby", { token, query: { lat: "abc", lng: "85" } });
    expect(res.status).toBe(400);
  });

  it("normalises Indian phone numbers to E.164", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("098765-43210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("919876543210")).toBe("+919876543210");
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull(); // Indian mobiles start with 6-9
  });
});

describe("rate limiting", () => {
  it("limits login attempts per IP and returns Retry-After", async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await call(loginRoute, "/api/auth/login", { body: { email: "x@raksha.test", password: "wrong-password" }, ip: "198.51.100.9" });
    }
    expect(last!.status).toBe(429);
    expect(last!.json).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
    // A different IP is unaffected.
    const other = await call(loginRoute, "/api/auth/login", { body: { email: "x@raksha.test", password: "wrong-password" }, ip: "198.51.100.10" });
    expect(other.status).toBe(401);
  });

  it("limits OTP requests per destination number across IPs (SMS-bombing)", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await call(otpRequestRoute, "/api/auth/otp/request", { body: { phone: "9876543210" }, ip: `198.51.100.${20 + i}` });
      statuses.push(r.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("allows a realistic burst of SOS presses but stops a runaway client", async () => {
    const token = await makeSession(await makeUser());
    const statuses: number[] = [];
    for (let i = 0; i < 13; i++) {
      const r = await call(triggerRoute, "/api/emergency/trigger", { token, body: { clientEventId: crypto.randomUUID() } });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 12).every((s) => s === 200 || s === 201)).toBe(true);
    expect(statuses[12]).toBe(429);
  });
});
