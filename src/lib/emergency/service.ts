import { ApiError } from "@/lib/api/errors";
import { getRepository } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { DEMO_POSITION } from "@/lib/maps/demo";
import { reverseGeocode } from "@/lib/maps/geocode";
import { dispatchNotifications, planContactNotifications, type DispatchExtras } from "@/lib/notifications/dispatcher";
import { audit } from "@/lib/security/audit";
import { hashToken, looksLikeToken } from "@/lib/security/tokens";
import { runInBackground } from "@/lib/server/background";
import type {
  EmergencyEvent,
  EmergencyLocation,
  EmergencyStatusPayload,
  NotificationKind,
  PublicEmergencyView,
  TriggerMethod,
  User,
} from "@/types";
import { mintShareLink, SHARE_STATUS_GRACE_MS } from "./share";

export interface LocationInput {
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  recordedAt?: string;
}

export interface TriggerInput {
  clientEventId: string;
  method: TriggerMethod;
  location?: LocationInput | null;
  batteryLevel?: number | null;
  triggeredAt?: string;
}

/** Demo mode never stores a real position: replace it with a jittered simulated one. */
function simulate(loc: LocationInput | null | undefined, seq = 0): LocationInput {
  const drift = seq * 0.00012;
  return {
    lat: DEMO_POSITION.lat + drift + (Math.random() - 0.5) * 0.0002,
    lng: DEMO_POSITION.lng + drift / 2 + (Math.random() - 0.5) * 0.0002,
    accuracy: DEMO_POSITION.accuracy,
    speed: loc?.speed ?? null,
    heading: loc?.heading ?? null,
    recordedAt: loc?.recordedAt,
  };
}

/** Device clocks drift; keep stored times within a sane window around server time. */
function clampTime(iso: string | undefined, min: number, now: number): string {
  const t = iso ? new Date(iso).getTime() : now;
  if (!Number.isFinite(t)) return new Date(now).toISOString();
  return new Date(Math.min(Math.max(t, min), now + 60_000)).toISOString();
}

function toLocationRow(loc: LocationInput, battery: number | null | undefined, recordedAt: string) {
  return {
    lat: loc.lat,
    lng: loc.lng,
    accuracy: loc.accuracy ?? null,
    speed: loc.speed ?? null,
    heading: loc.heading ?? null,
    batteryLevel: battery ?? null,
    recordedAt,
  };
}

/**
 * The SOS hot path. Writes the event, first location and pending notification rows, then
 * returns immediately. Delivery and reverse geocoding run after the response is sent.
 * Idempotent on clientEventId: an offline client retrying the same press never duplicates.
 */
export async function triggerEmergency(
  user: User,
  input: TriggerInput,
  meta: { ipHash?: string | null } = {},
): Promise<{ event: EmergencyEvent; shareUrl: string; created: boolean }> {
  const repo = getRepository();
  const now = Date.now();

  const existing =
    (await repo.getEmergencyByClientId(user.id, input.clientEventId)) ?? (await repo.getActiveEmergency(user.id));
  if (existing && existing.status === "active") {
    if (input.location) {
      const loc = isDemoMode() ? simulate(input.location) : input.location;
      await repo.addLocation({ eventId: existing.id, ...toLocationRow(loc, input.batteryLevel, clampTime(loc.recordedAt, new Date(existing.startedAt).getTime() - 5 * 60_000, now)) });
    }
    const { url } = await mintShareLink(existing.id, null);
    return { event: existing, shareUrl: url, created: false };
  }
  if (existing) {
    // Same clientEventId but already ended: the client is replaying an old press. Report, do not re-alert.
    const { url } = await mintShareLink(existing.id, null);
    return { event: existing, shareUrl: url, created: false };
  }

  const startedAt = clampTime(input.triggeredAt, now - 30 * 60_000, now);
  const location = input.location ? (isDemoMode() ? simulate(input.location) : input.location) : isDemoMode() ? simulate(null) : null;

  const event = await repo.createEmergency(
    {
      userId: user.id,
      status: "active",
      triggerMethod: input.method,
      clientEventId: input.clientEventId,
      startedAt,
      endedAt: null,
      endReason: null,
      startLat: location?.lat ?? null,
      startLng: location?.lng ?? null,
      startAccuracy: location?.accuracy ?? null,
      address: null,
      batteryLevel: input.batteryLevel ?? null,
      isDemo: isDemoMode(),
      sourceRef: null,
    },
    location ? toLocationRow(location, input.batteryLevel, clampTime(location.recordedAt, now - 30 * 60_000, now)) : null,
  );

  const [{ url }, contacts] = await Promise.all([mintShareLink(event.id, null), repo.listContacts(user.id)]);
  const planned = await planContactNotifications(user, contacts, "sos", { eventId: event.id });

  runInBackground(async () => {
    await dispatchNotifications(planned);
  });
  if (location) {
    runInBackground(async () => {
      const address = await reverseGeocode(location, user.locale);
      if (address) await repo.updateEmergency(event.id, { address });
    });
  }
  runInBackground(() =>
    audit({
      userId: user.id,
      actor: "user",
      action: "emergency.triggered",
      targetType: "emergency",
      targetId: event.id,
      ipHash: meta.ipHash,
      metadata: { method: input.method, contacts: contacts.length, notifications: planned.length, hasLocation: Boolean(location) },
    }),
  );

  return { event, shareUrl: url, created: true };
}

export async function recordLocations(
  user: User,
  eventId: string,
  locations: LocationInput[],
  batteryLevel?: number | null,
): Promise<{ stored: number; latest: EmergencyLocation | null }> {
  const repo = getRepository();
  const event = await repo.getEmergency(user.id, eventId);
  if (!event) throw new ApiError("EMERGENCY_NOT_FOUND", "This emergency could not be found.");
  if (event.status !== "active") throw new ApiError("EMERGENCY_NOT_ACTIVE", "This emergency has already ended.");

  const now = Date.now();
  const min = new Date(event.startedAt).getTime() - 5 * 60_000;
  const count = isDemoMode() ? await repo.countLocations(eventId) : 0;
  const sorted = [...locations].sort((a, b) => (a.recordedAt ?? "").localeCompare(b.recordedAt ?? ""));
  let latest: EmergencyLocation | null = null;
  for (const [i, raw] of sorted.entries()) {
    const loc = isDemoMode() ? simulate(raw, count + i) : raw;
    latest = await repo.addLocation({ eventId, ...toLocationRow(loc, batteryLevel, clampTime(loc.recordedAt, min, now)) });
  }
  // Keep contacts' links alive while she is still sharing.
  await repo.extendActiveShares(eventId, new Date(now + 2 * 60 * 60_000).toISOString());
  if (!event.startLat && latest) {
    await repo.updateEmergency(eventId, { startLat: latest.lat, startLng: latest.lng, startAccuracy: latest.accuracy });
    const point = latest;
    runInBackground(async () => {
      const address = await reverseGeocode(point, user.locale);
      if (address) await repo.updateEmergency(eventId, { address });
    });
  }
  return { stored: sorted.length, latest };
}

export type EndReason = "safe" | "mistake" | "other";

export async function endEmergency(user: User, eventId: string, reason: EndReason, meta: { ipHash?: string | null } = {}) {
  const repo = getRepository();
  const event = await repo.getEmergency(user.id, eventId);
  if (!event) throw new ApiError("EMERGENCY_NOT_FOUND", "This emergency could not be found.");
  if (event.status !== "active") return event;

  const endedAt = new Date().toISOString();
  const updated = await repo.updateEmergency(eventId, {
    status: reason === "safe" ? "resolved" : "cancelled",
    endedAt,
    endReason: reason,
  });
  // Location sharing stops immediately; links keep showing the "ended" status only.
  await repo.revokeShares(eventId, endedAt);

  // Tell everyone who was alerted that she is OK, so nobody keeps searching.
  const sent = await repo.listNotifications({ eventId });
  const contactIds = [...new Set(sent.filter((n) => n.kind !== "emergency_ended" && n.contactId).map((n) => n.contactId!))];
  if (contactIds.length > 0) {
    const contacts = (await repo.listContacts(user.id)).filter((c) => contactIds.includes(c.id));
    const planned = await planContactNotifications(user, contacts, "emergency_ended", { eventId });
    runInBackground(() => dispatchNotifications(planned));
  }
  runInBackground(() =>
    audit({ userId: user.id, actor: "user", action: "emergency.ended", targetType: "emergency", targetId: eventId, ipHash: meta.ipHash, metadata: { reason } }),
  );
  return updated;
}

export async function getEmergencyStatus(user: User, eventId?: string | null): Promise<EmergencyStatusPayload | null> {
  const repo = getRepository();
  const event = eventId ? await repo.getEmergency(user.id, eventId) : await repo.getActiveEmergency(user.id);
  if (!event) return null;
  const [latestLocation, locationCount, notifications, contacts, shares] = await Promise.all([
    repo.getLatestLocation(event.id),
    repo.countLocations(event.id),
    repo.listNotifications({ eventId: event.id }),
    repo.listContacts(user.id),
    repo.listShares(event.id),
  ]);
  const names = new Map(contacts.map((c) => [c.id, c.name]));
  const activeShare = shares.find((s) => !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now());
  return {
    event,
    latestLocation,
    locationCount,
    notifications: notifications.map((n) => ({
      id: n.id,
      channel: n.channel,
      kind: n.kind,
      status: n.status,
      recipientMasked: n.recipientMasked,
      contactId: n.contactId,
      attempts: n.attempts,
      sentAt: n.sentAt,
      contactName: n.contactId ? names.get(n.contactId) ?? null : null,
    })),
    // Raw tokens are never stored, so the URL is only available from create/trigger responses.
    share: { url: null, expiresAt: activeShare?.expiresAt ?? null, active: Boolean(activeShare) },
  };
}

export async function createOwnerShare(user: User, eventId: string, revokeExisting = false) {
  const repo = getRepository();
  const event = await repo.getEmergency(user.id, eventId);
  if (!event) throw new ApiError("EMERGENCY_NOT_FOUND", "This emergency could not be found.");
  if (event.status !== "active") throw new ApiError("EMERGENCY_NOT_ACTIVE", "Location sharing has ended for this emergency.");
  if (revokeExisting) await repo.revokeShares(eventId, new Date().toISOString());
  const { url, share } = await mintShareLink(eventId, null);
  await audit({ userId: user.id, actor: "user", action: revokeExisting ? "share.rotated" : "share.created", targetType: "emergency", targetId: eventId });
  return { url, expiresAt: share.expiresAt };
}

/** Resolves a public /emergency/[token] link into the minimal view a trusted contact may see. */
export async function resolvePublicEmergency(token: string): Promise<PublicEmergencyView> {
  if (!looksLikeToken(token)) throw new ApiError("TOKEN_INVALID", "This link is not valid.");
  const repo = getRepository();
  const share = await repo.getShareByTokenHash(hashToken(token));
  if (!share) throw new ApiError("TOKEN_INVALID", "This link is not valid.");
  const event = await repo.getEmergencyById(share.eventId);
  if (!event) throw new ApiError("TOKEN_INVALID", "This link is not valid.");
  const user = await repo.getUserById(event.userId);
  if (!user) throw new ApiError("TOKEN_INVALID", "This link is not valid.");

  const now = Date.now();
  const ended = event.status !== "active";
  if (ended) {
    if (!event.endedAt || now - new Date(event.endedAt).getTime() > SHARE_STATUS_GRACE_MS) {
      throw new ApiError("TOKEN_EXPIRED", "This emergency link has expired.");
    }
  } else {
    if (share.revokedAt) throw new ApiError("TOKEN_INVALID", "This link was turned off by its owner.");
    if (new Date(share.expiresAt).getTime() < now) throw new ApiError("TOKEN_EXPIRED", "This emergency link has expired.");
  }

  void repo.updateShare(share.id, { lastViewedAt: new Date(now).toISOString(), viewCount: share.viewCount + 1 }).catch(() => undefined);
  const location = ended ? null : await repo.getLatestLocation(event.id);
  const triggerKind = event.triggerMethod === "checkin_missed" ? "checkin" : event.triggerMethod === "journey_overdue" ? "journey" : "sos";

  return {
    name: user.name,
    phone: user.phone,
    status: event.status,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    endReason: event.endReason,
    triggerKind,
    location: location
      ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy, recordedAt: location.recordedAt, batteryLevel: location.batteryLevel }
      : null,
    address: ended ? null : event.address,
    locationSharingActive: !ended,
    region: user.preferences.region,
    isDemo: event.isDemo,
  };
}

/**
 * Creates an emergency on her behalf when a safety timer runs out (missed check-in, overdue
 * journey). Only trusted contacts are notified; Raksha never calls police automatically.
 */
export async function createEscalationEmergency(
  user: User,
  params: {
    method: "checkin_missed" | "journey_overdue";
    sourceRef: string;
    kind: Extract<NotificationKind, "checkin_escalation" | "journey_escalation">;
    location: { lat: number; lng: number } | null;
    contactIds?: string[];
    extras: DispatchExtras;
    refs: { checkInId?: string; journeyId?: string };
  },
): Promise<EmergencyEvent> {
  const repo = getRepository();
  const active = await repo.getActiveEmergency(user.id);
  const loc = params.location ? (isDemoMode() ? simulate(params.location) : params.location) : null;
  const event =
    active ??
    (await repo.createEmergency(
      {
        userId: user.id,
        status: "active",
        triggerMethod: params.method,
        clientEventId: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        endReason: null,
        startLat: loc?.lat ?? null,
        startLng: loc?.lng ?? null,
        startAccuracy: null,
        address: null,
        batteryLevel: null,
        isDemo: isDemoMode(),
        sourceRef: params.sourceRef,
      },
      loc ? toLocationRow(loc, null, new Date().toISOString()) : null,
    ));
  const all = await repo.listContacts(user.id);
  const contacts = params.contactIds?.length ? all.filter((c) => params.contactIds!.includes(c.id)) : all;
  const planned = await planContactNotifications(user, contacts, params.kind, { eventId: event.id, ...params.refs });
  await dispatchNotifications(planned, params.extras);
  await audit({ userId: user.id, actor: "system", action: `emergency.escalated.${params.method}`, targetType: "emergency", targetId: event.id, metadata: { contacts: contacts.length } });
  return event;
}
