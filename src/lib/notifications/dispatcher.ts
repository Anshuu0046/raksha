import { getRepository } from "@/lib/db";
import { alertInviteUrl, mintShareLink } from "@/lib/emergency/share";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { maskEmail, maskPhone } from "@/lib/utils";
import type { Channel, NotificationKind, NotificationRecord, TrustedContact, User } from "@/types";
import { getEmailProvider } from "./providers/email";
import { getPushProvider } from "./providers/push";
import { getSmsProvider } from "./providers/sms";
import { renderMessage, type RenderedMessage } from "./templates";
import type { DeliveryResult, EmailProvider, PushProvider, SmsProvider } from "./types";

/** Test seam: inject fake providers. Production code never calls this. */
const overrides: { sms?: SmsProvider; email?: EmailProvider; push?: PushProvider } = {};
export function setNotificationProvidersForTesting(next: typeof overrides) {
  overrides.sms = next.sms;
  overrides.email = next.email;
  overrides.push = next.push;
}
const sms = () => overrides.sms ?? getSmsProvider();
const email = () => overrides.email ?? getEmailProvider();
const push = () => overrides.push ?? getPushProvider();

const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [30_000, 2 * 60_000, 10 * 60_000];
const LEASE_MS = 2 * 60_000;

/** Kinds that carry a live-location link minted per contact. */
const LINK_KINDS: NotificationKind[] = ["sos", "checkin_escalation", "journey_escalation"];

export interface NotificationRefs {
  eventId?: string | null;
  checkInId?: string | null;
  journeyId?: string | null;
}

function recipientFor(contact: TrustedContact, channel: Channel): string {
  if (channel === "sms") return maskPhone(contact.phone);
  if (channel === "email") return maskEmail(contact.email);
  return `${contact.name.split(" ")[0]} · push`;
}

/**
 * Creates pending notification rows for every reachable channel of every contact.
 * Rows are written before anything is sent, so a crash mid-dispatch leaves a retryable record.
 */
export async function planContactNotifications(
  user: User,
  contacts: TrustedContact[],
  kind: NotificationKind,
  refs: NotificationRefs,
  onlyChannels?: Channel[],
): Promise<NotificationRecord[]> {
  const repo = getRepository();
  const rows: Array<Omit<NotificationRecord, "id" | "createdAt">> = [];
  for (const contact of contacts) {
    const channels: Channel[] = [];
    if (contact.notifySms && contact.phone) channels.push("sms");
    if (contact.notifyEmail && contact.email) channels.push("email");
    if (contact.notifyPush && (await repo.listPushSubscriptions({ contactId: contact.id })).length > 0) channels.push("push");
    for (const channel of channels) {
      if (onlyChannels && !onlyChannels.includes(channel)) continue;
      rows.push({
        userId: user.id,
        eventId: refs.eventId ?? null,
        checkInId: refs.checkInId ?? null,
        journeyId: refs.journeyId ?? null,
        contactId: contact.id,
        channel,
        kind,
        status: "pending",
        provider: null,
        providerMessageId: null,
        recipientMasked: recipientFor(contact, channel),
        attempts: 0,
        lastError: null,
        nextAttemptAt: null,
        sentAt: null,
      });
    }
  }
  return repo.createNotifications(rows);
}

/** Push to the user's own devices (check-in / journey reminders). */
export async function planSelfPush(user: User, kind: NotificationKind, refs: NotificationRefs) {
  const repo = getRepository();
  const subs = await repo.listPushSubscriptions({ userId: user.id });
  if (subs.length === 0) return [];
  return repo.createNotifications([
    {
      userId: user.id,
      eventId: refs.eventId ?? null,
      checkInId: refs.checkInId ?? null,
      journeyId: refs.journeyId ?? null,
      contactId: null,
      channel: "push",
      kind,
      status: "pending",
      provider: null,
      providerMessageId: null,
      recipientMasked: "you",
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
      sentAt: null,
    },
  ]);
}

async function sendPush(subs: Awaited<ReturnType<ReturnType<typeof getRepository>["listPushSubscriptions"]>>, message: RenderedMessage["push"]): Promise<DeliveryResult> {
  const repo = getRepository();
  if (subs.length === 0) return { status: "skipped", provider: "web-push", error: "No subscribed devices", permanent: true };
  const provider = push();
  const results = await Promise.all(
    subs.map(async (s) => {
      const r = await provider.send(s, message);
      if ("gone" in r && r.gone) await repo.deletePushSubscription(s.endpoint);
      else if (r.status === "failed") await repo.recordPushFailure(s.id);
      return r;
    }),
  );
  return results.find((r) => r.status === "sent" || r.status === "simulated") ?? results[0]!;
}

interface Group {
  contactId: string | null;
  userId: string;
  kind: NotificationKind;
  refs: NotificationRefs;
  items: NotificationRecord[];
}

async function dispatchGroup(group: Group, extras: DispatchExtras) {
  const repo = getRepository();
  const user = await repo.getUserById(group.userId);
  const now = new Date().toISOString();
  const finish = (n: NotificationRecord, r: DeliveryResult) => {
    const attempts = n.attempts + 1;
    const retry = r.status === "failed" && !r.permanent && attempts < MAX_ATTEMPTS;
    return repo.updateNotification(n.id, {
      status: r.status,
      provider: r.provider,
      providerMessageId: r.messageId ?? null,
      attempts,
      lastError: r.error ?? null,
      nextAttemptAt: retry ? new Date(Date.now() + BACKOFF_MS[attempts - 1]!).toISOString() : null,
      sentAt: r.status === "sent" || r.status === "simulated" ? now : null,
    });
  };

  if (!user) {
    await Promise.all(group.items.map((n) => finish(n, { status: "skipped", provider: "none", error: "Account deleted", permanent: true })));
    return;
  }
  const contact = group.contactId ? await repo.getContact(user.id, group.contactId) : null;
  if (group.contactId && !contact) {
    await Promise.all(group.items.map((n) => finish(n, { status: "skipped", provider: "none", error: "Contact removed", permanent: true })));
    return;
  }

  const event = group.refs.eventId ? await repo.getEmergencyById(group.refs.eventId) : null;
  const location = event ? await repo.getLatestLocation(event.id) : null;

  // A per-contact link, so each recipient's access can be revoked and audited independently.
  let link: string | null = null;
  const wantsLink = group.kind === "sos" || user.preferences.shareLocationOnEscalation;
  if (event && event.status === "active" && LINK_KINDS.includes(group.kind) && wantsLink) {
    link = (await mintShareLink(event.id, contact?.id ?? null)).url;
  }
  let inviteLink: string | null = null;
  if (group.kind === "test" && contact && contact.notifyPush) {
    const token = generateToken();
    await repo.updateContact(user.id, contact.id, { alertTokenHash: hashToken(token) });
    inviteLink = alertInviteUrl(token);
  }

  const rendered = await renderMessage({
    kind: group.kind,
    locale: contact?.locale ?? user.locale,
    userName: user.name,
    userPhone: user.phone,
    link,
    inviteLink,
    at: event?.startedAt ?? now,
    location: location ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy } : null,
    address: event?.address ?? null,
    battery: location?.batteryLevel ?? event?.batteryLevel ?? null,
    destination: extras.destination ?? null,
    dueAt: extras.dueAt ?? null,
    endReason: event?.endReason ?? null,
    graceMinutes: extras.graceMinutes,
  });

  await Promise.all(
    group.items.map(async (n) => {
      let result: DeliveryResult;
      try {
        if (n.channel === "sms") {
          result = contact?.phone
            ? await sms().send({ ...rendered.sms, to: contact.phone })
            : { status: "skipped", provider: "none", error: "No phone number", permanent: true };
        } else if (n.channel === "email") {
          result = contact?.email
            ? await email().send({ ...rendered.email, to: contact.email })
            : { status: "skipped", provider: "none", error: "No email address", permanent: true };
        } else {
          const subs = await repo.listPushSubscriptions(contact ? { contactId: contact.id } : { userId: user.id });
          result = await sendPush(subs, rendered.push);
        }
      } catch (err) {
        console.error("[raksha] provider threw:", err instanceof Error ? err.message : err);
        result = { status: "failed", provider: "unknown", error: "Unexpected delivery error" };
      }
      await finish(n, result);
    }),
  );
}

export interface DispatchExtras {
  destination?: string | null;
  dueAt?: string | null;
  graceMinutes?: number;
}

/**
 * Claims and sends notifications. Safe to call concurrently from the post-response hook and
 * the cron worker: each row is leased atomically before sending.
 */
export async function dispatchNotifications(rows: NotificationRecord[], extras: DispatchExtras = {}): Promise<void> {
  const repo = getRepository();
  const now = new Date().toISOString();
  const lease = new Date(Date.now() + LEASE_MS).toISOString();
  const claimed: NotificationRecord[] = [];
  for (const row of rows) if (await repo.claimNotification(row.id, now, lease)) claimed.push(row);

  const groups = new Map<string, Group>();
  for (const n of claimed) {
    const key = [n.userId, n.contactId ?? "self", n.kind, n.eventId, n.checkInId, n.journeyId].join("|");
    const g = groups.get(key) ?? {
      contactId: n.contactId,
      userId: n.userId,
      kind: n.kind,
      refs: { eventId: n.eventId, checkInId: n.checkInId, journeyId: n.journeyId },
      items: [],
    };
    g.items.push(n);
    groups.set(key, g);
  }
  await Promise.all([...groups.values()].map((g) => dispatchGroup(g, extras)));
}

/** Cron entry point: retries failed notifications whose backoff elapsed and any stuck pending rows. */
export async function processDueNotifications(limit = 100): Promise<number> {
  const repo = getRepository();
  const due = await repo.listDueNotifications(new Date().toISOString(), limit);
  if (due.length === 0) return 0;
  // Escalation messages need their journey/check-in context to render.
  const extrasByRef = new Map<string, DispatchExtras>();
  for (const n of due) {
    if (n.journeyId && !extrasByRef.has(n.journeyId)) {
      const j = await repo.getJourney(n.userId, n.journeyId);
      extrasByRef.set(n.journeyId, { destination: j?.destinationLabel, dueAt: j?.expectedArrivalAt });
    }
    if (n.checkInId && !extrasByRef.has(n.checkInId)) {
      const c = await repo.getCheckIn(n.userId, n.checkInId);
      extrasByRef.set(n.checkInId, { dueAt: c?.dueAt, graceMinutes: c?.graceMinutes });
    }
  }
  const byExtras = new Map<string, NotificationRecord[]>();
  for (const n of due) {
    const key = n.journeyId ?? n.checkInId ?? "none";
    byExtras.set(key, [...(byExtras.get(key) ?? []), n]);
  }
  for (const [key, rows] of byExtras) await dispatchNotifications(rows, extrasByRef.get(key) ?? {});
  return due.length;
}
