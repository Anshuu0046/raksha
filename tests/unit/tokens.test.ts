import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { POST as cancelRoute } from "@/app/api/emergency/cancel/route";
import { POST as shareRoute } from "@/app/api/emergency/share/route";
import { POST as triggerRoute } from "@/app/api/emergency/trigger/route";
import { GET as publicRoute } from "@/app/api/public/emergency/[token]/route";
import { getRepository } from "@/lib/db";
import { generateToken, hashToken, looksLikeToken } from "@/lib/security/tokens";
import { call, fakeProviders, makeContact, makeSession, makeUser } from "./helpers";

const tok = (url: string) => url.split("/emergency/")[1]!;

async function activeEmergency() {
  fakeProviders();
  const user = await makeUser();
  await makeContact(user);
  const token = await makeSession(user);
  const t = await call<{ eventId: string; shareUrl: string }>(triggerRoute, "/api/emergency/trigger", {
    token,
    body: { clientEventId: randomUUID(), location: { lat: 20.3, lng: 85.8, accuracy: 9 } },
  });
  return { user, token, ...t.data };
}

const view = (shareUrl: string) => call<Record<string, unknown>>(publicRoute, "/api/public/emergency/x", { params: { token: tok(shareUrl) } });

describe("secure location-sharing tokens", () => {
  it("are 256-bit random, URL-safe, and stored only as SHA-256 hashes", async () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(looksLikeToken(t)).toBe(true);
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/);
    const { eventId, shareUrl } = await activeEmergency();
    const shares = await getRepository().listShares(eventId);
    expect(shares.some((s) => s.tokenHash === hashToken(tok(shareUrl)))).toBe(true);
    expect(JSON.stringify(shares)).not.toContain(tok(shareUrl));
  });

  it("show name, status and live location to a contact without an account", async () => {
    const { shareUrl, eventId } = await activeEmergency();
    const res = await view(shareUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.data).toMatchObject({ name: "Ananya Test", status: "active", locationSharingActive: true });
    expect((res.data.location as { lat: number }).lat).toBe(20.3);
    // Never leaks internal identifiers.
    expect(JSON.stringify(res.data)).not.toContain(eventId);
  });

  it("reject malformed and unknown tokens with the same error", async () => {
    const bad = await call(publicRoute, "/api/public/emergency/x", { params: { token: "../../etc" } });
    const unknown = await call(publicRoute, "/api/public/emergency/x", { params: { token: generateToken() } });
    expect(bad.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(bad.json).toMatchObject({ error: { code: "TOKEN_INVALID" } });
  });

  it("expire after 24 hours while active", async () => {
    const { shareUrl } = await activeEmergency();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    const res = await view(shareUrl);
    expect(res.status).toBe(410);
    expect(res.json).toMatchObject({ error: { code: "TOKEN_EXPIRED" } });
  });

  it("can be revoked by rotating the link", async () => {
    const { shareUrl, eventId, token } = await activeEmergency();
    const rotated = await call<{ url: string }>(shareRoute, "/api/emergency/share", { token, body: { eventId, revokeExisting: true } });
    expect((await view(shareUrl)).status).toBe(404);
    expect((await view(rotated.data.url)).status).toBe(200);
  });

  it("stop showing location once the emergency ends, then stop working entirely after 7 days", async () => {
    const { shareUrl, eventId, token } = await activeEmergency();
    await call(cancelRoute, "/api/emergency/cancel", { token, body: { eventId, reason: "safe" } });
    const ended = await view(shareUrl);
    expect(ended.data).toMatchObject({ status: "resolved", location: null, address: null });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect((await view(shareUrl)).status).toBe(410);
  });
});
