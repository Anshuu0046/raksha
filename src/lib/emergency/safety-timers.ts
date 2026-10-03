import { ApiError } from "@/lib/api/errors";
import { getRepository } from "@/lib/db";
import { dispatchNotifications, planSelfPush } from "@/lib/notifications/dispatcher";
import { audit } from "@/lib/security/audit";
import type { CheckIn, SafeJourney, User } from "@/types";
import { createEscalationEmergency, endEmergency, type LocationInput } from "./service";

const MINUTE = 60_000;

// ------------------------------------------------------------------ Check-ins

export async function startCheckIn(user: User, minutes: number, note: string | null | undefined, location?: LocationInput | null): Promise<CheckIn> {
  const repo = getRepository();
  if (await repo.getActiveCheckIn(user.id)) {
    throw new ApiError("CHECKIN_ALREADY_ACTIVE", "You already have a check-in running. Complete or extend it first.");
  }
  const now = Date.now();
  const checkIn = await repo.createCheckIn({
    userId: user.id,
    status: "active",
    startedAt: new Date(now).toISOString(),
    dueAt: new Date(now + minutes * MINUTE).toISOString(),
    graceMinutes: user.preferences.checkInGraceMinutes,
    reminderSentAt: null,
    escalatedAt: null,
    completedAt: null,
    note: note ?? null,
    lastLat: location?.lat ?? null,
    lastLng: location?.lng ?? null,
    eventId: null,
  });
  await audit({ userId: user.id, actor: "user", action: "checkin.started", targetType: "check_in", targetId: checkIn.id, metadata: { minutes } });
  return checkIn;
}

export async function updateCheckIn(
  user: User,
  checkInId: string,
  action: "complete" | "cancel" | "extend",
  extendMinutes = 15,
): Promise<CheckIn> {
  const repo = getRepository();
  const checkIn = await repo.getCheckIn(user.id, checkInId);
  if (!checkIn) throw new ApiError("NOT_FOUND", "Check-in not found.");
  const now = new Date().toISOString();

  if (action === "extend") {
    if (checkIn.status !== "active") throw new ApiError("CONFLICT", "This check-in has already finished.");
    const base = Math.max(Date.now(), new Date(checkIn.dueAt).getTime());
    return repo.updateCheckIn(checkIn.id, { dueAt: new Date(base + extendMinutes * MINUTE).toISOString(), reminderSentAt: null });
  }

  if (checkIn.status === "escalated" && checkIn.eventId && action === "complete") {
    // She checked in late: close the escalation and tell contacts she is safe.
    await endEmergency(user, checkIn.eventId, "safe");
  }
  if (checkIn.status !== "active" && checkIn.status !== "escalated") return checkIn;
  const updated = await repo.updateCheckIn(checkIn.id, {
    status: action === "complete" ? "completed" : "cancelled",
    completedAt: now,
  });
  await audit({ userId: user.id, actor: "user", action: `checkin.${action}`, targetType: "check_in", targetId: checkIn.id });
  return updated;
}

async function processCheckIns(now: number) {
  const repo = getRepository();
  const due = await repo.listDueCheckIns(new Date(now).toISOString());
  let escalated = 0;
  for (const checkIn of due) {
    const user = await repo.getUserById(checkIn.userId);
    if (!user) continue;
    const dueAt = new Date(checkIn.dueAt).getTime();
    const escalateAt = dueAt + checkIn.graceMinutes * MINUTE;

    if (now >= escalateAt) {
      // Atomic claim: a concurrent worker cannot escalate the same check-in twice.
      const claimed = await repo.transitionCheckIn(checkIn.id, "active", { status: "escalated", escalatedAt: new Date(now).toISOString() });
      if (!claimed) continue;
      const event = await createEscalationEmergency(user, {
        method: "checkin_missed",
        sourceRef: checkIn.id,
        kind: "checkin_escalation",
        location: checkIn.lastLat != null && checkIn.lastLng != null ? { lat: checkIn.lastLat, lng: checkIn.lastLng } : null,
        extras: { dueAt: checkIn.dueAt, graceMinutes: checkIn.graceMinutes },
        refs: { checkInId: checkIn.id },
      });
      await repo.updateCheckIn(checkIn.id, { eventId: event.id });
      escalated++;
    } else if (!checkIn.reminderSentAt) {
      const marked = await repo.transitionCheckIn(checkIn.id, "active", { reminderSentAt: new Date(now).toISOString() });
      if (!marked) continue;
      const planned = await planSelfPush(user, "checkin_reminder", { checkInId: checkIn.id });
      await dispatchNotifications(planned, { graceMinutes: checkIn.graceMinutes });
    }
  }
  return escalated;
}

// ------------------------------------------------------------------ Safe journeys

export interface JourneyInput {
  destinationLabel: string;
  destination?: { lat: number; lng: number } | null;
  expectedArrivalAt: string;
  graceMinutes: number;
  contactIds: string[];
  location?: LocationInput | null;
}

export async function startJourney(user: User, input: JourneyInput): Promise<SafeJourney> {
  const repo = getRepository();
  if (await repo.getActiveJourney(user.id)) {
    throw new ApiError("JOURNEY_ALREADY_ACTIVE", "You already have a journey in progress.");
  }
  const eta = new Date(input.expectedArrivalAt).getTime();
  const now = Date.now();
  if (eta < now + MINUTE) throw new ApiError("VALIDATION_ERROR", "Expected arrival must be in the future.");
  if (eta > now + 24 * 60 * MINUTE) throw new ApiError("VALIDATION_ERROR", "Journeys can be at most 24 hours long.");
  const owned = new Set((await repo.listContacts(user.id)).map((c) => c.id));
  const contactIds = input.contactIds.filter((id) => owned.has(id));
  if (contactIds.length === 0) throw new ApiError("NO_CONTACTS", "Choose at least one of your trusted contacts.");

  const journey = await repo.createJourney({
    userId: user.id,
    status: "active",
    destinationLabel: input.destinationLabel,
    destLat: input.destination?.lat ?? null,
    destLng: input.destination?.lng ?? null,
    startLat: input.location?.lat ?? null,
    startLng: input.location?.lng ?? null,
    startedAt: new Date(now).toISOString(),
    expectedArrivalAt: new Date(eta).toISOString(),
    graceMinutes: input.graceMinutes,
    contactIds,
    lastLat: input.location?.lat ?? null,
    lastLng: input.location?.lng ?? null,
    lastLocationAt: input.location ? new Date(now).toISOString() : null,
    reminderSentAt: null,
    completedAt: null,
    escalatedAt: null,
    eventId: null,
  });
  await audit({ userId: user.id, actor: "user", action: "journey.started", targetType: "journey", targetId: journey.id });
  return journey;
}

export async function updateJourneyLocation(user: User, journeyId: string, location: LocationInput): Promise<SafeJourney> {
  const repo = getRepository();
  const journey = await repo.getJourney(user.id, journeyId);
  if (!journey || journey.status !== "active") throw new ApiError("NOT_FOUND", "No active journey found.");
  return repo.updateJourney(journey.id, { lastLat: location.lat, lastLng: location.lng, lastLocationAt: new Date().toISOString() });
}

export async function finishJourney(user: User, journeyId: string, action: "arrived" | "cancel"): Promise<SafeJourney> {
  const repo = getRepository();
  const journey = await repo.getJourney(user.id, journeyId);
  if (!journey) throw new ApiError("NOT_FOUND", "Journey not found.");
  if (journey.status === "escalated" && journey.eventId && action === "arrived") {
    await endEmergency(user, journey.eventId, "safe");
  }
  if (journey.status !== "active" && journey.status !== "escalated") return journey;
  const updated = await repo.updateJourney(journey.id, {
    status: action === "arrived" ? "completed" : "cancelled",
    completedAt: new Date().toISOString(),
  });
  await audit({ userId: user.id, actor: "user", action: `journey.${action}`, targetType: "journey", targetId: journey.id });
  return updated;
}

async function processJourneys(now: number) {
  const repo = getRepository();
  const due = await repo.listDueJourneys(new Date(now).toISOString());
  let escalated = 0;
  for (const journey of due) {
    const user = await repo.getUserById(journey.userId);
    if (!user) continue;
    const escalateAt = new Date(journey.expectedArrivalAt).getTime() + journey.graceMinutes * MINUTE;
    if (now >= escalateAt) {
      const claimed = await repo.transitionJourney(journey.id, "active", { status: "escalated", escalatedAt: new Date(now).toISOString() });
      if (!claimed) continue;
      const last = journey.lastLat != null && journey.lastLng != null ? { lat: journey.lastLat, lng: journey.lastLng } : null;
      const event = await createEscalationEmergency(user, {
        method: "journey_overdue",
        sourceRef: journey.id,
        kind: "journey_escalation",
        location: last,
        contactIds: journey.contactIds,
        extras: { destination: journey.destinationLabel, dueAt: journey.expectedArrivalAt },
        refs: { journeyId: journey.id },
      });
      await repo.updateJourney(journey.id, { eventId: event.id });
      escalated++;
    } else if (!journey.reminderSentAt) {
      await repo.updateJourney(journey.id, { reminderSentAt: new Date(now).toISOString() });
      const planned = await planSelfPush(user, "journey_reminder", { journeyId: journey.id });
      await dispatchNotifications(planned, { graceMinutes: journey.graceMinutes });
    }
  }
  return escalated;
}

// ------------------------------------------------------------------ Scheduler

export async function processSafetyTimers(now = Date.now()) {
  const [checkIns, journeys] = await Promise.all([processCheckIns(now), processJourneys(now)]);
  return { checkInsEscalated: checkIns, journeysEscalated: journeys };
}
