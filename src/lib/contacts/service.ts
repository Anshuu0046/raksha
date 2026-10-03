import { ApiError } from "@/lib/api/errors";
import { getRepository } from "@/lib/db";
import { isLocale } from "@/lib/i18n/config";
import { dispatchNotifications, planContactNotifications } from "@/lib/notifications/dispatcher";
import { audit } from "@/lib/security/audit";
import type { Channel, TrustedContact, User } from "@/types";

export const MAX_CONTACTS = 10;

/** Contact as returned to its owner. Internal fields (invite token hash) are stripped. */
export type ContactView = Omit<TrustedContact, "alertTokenHash"> & { pushEnabled: boolean };

export async function toContactView(contact: TrustedContact): Promise<ContactView> {
  const { alertTokenHash: _hash, ...rest } = contact;
  const subs = await getRepository().listPushSubscriptions({ contactId: contact.id });
  return { ...rest, pushEnabled: subs.length > 0 };
}

export interface ContactInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  relationship: TrustedContact["relationship"];
  customRelationship?: string | null;
  locale?: string;
  notifySms?: boolean;
  notifyEmail?: boolean;
  notifyPush?: boolean;
  isPrimary?: boolean;
}

export async function createContact(user: User, input: ContactInput): Promise<TrustedContact> {
  const repo = getRepository();
  const existing = await repo.listContacts(user.id);
  if (existing.length >= MAX_CONTACTS) {
    throw new ApiError("CONTACT_LIMIT_REACHED", `You can add up to ${MAX_CONTACTS} trusted contacts.`);
  }
  const makePrimary = input.isPrimary || existing.length === 0;
  const contact = await repo.createContact({
    userId: user.id,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    relationship: input.relationship,
    customRelationship: input.relationship === "custom" ? input.customRelationship ?? null : null,
    locale: isLocale(input.locale) ? input.locale : user.locale,
    notifySms: input.notifySms ?? true,
    notifyEmail: input.notifyEmail ?? true,
    notifyPush: input.notifyPush ?? true,
    isPrimary: false,
    alertTokenHash: null,
  });
  if (makePrimary) await repo.setPrimaryContact(user.id, contact.id);
  await audit({ userId: user.id, actor: "user", action: "contact.created", targetType: "contact", targetId: contact.id });
  return (await repo.getContact(user.id, contact.id))!;
}

export async function updateContact(user: User, id: string, input: Partial<ContactInput>): Promise<TrustedContact> {
  const repo = getRepository();
  const current = await repo.getContact(user.id, id);
  if (!current) throw new ApiError("CONTACT_NOT_FOUND", "Contact not found.");
  const next = { ...current, ...input };
  if (!next.phone && !next.email) {
    throw new ApiError("VALIDATION_ERROR", "Add a phone number or an email so this contact can be reached.", [{ path: "phone", message: "Required" }]);
  }
  const { isPrimary, ...patch } = input;
  const updated = await repo.updateContact(user.id, id, {
    ...patch,
    locale: input.locale && isLocale(input.locale) ? input.locale : undefined,
    customRelationship: (input.relationship ?? current.relationship) === "custom" ? input.customRelationship ?? current.customRelationship : null,
  });
  if (!updated) throw new ApiError("CONTACT_NOT_FOUND", "Contact not found.");
  if (isPrimary) await repo.setPrimaryContact(user.id, id);
  return (await repo.getContact(user.id, id))!;
}

export async function deleteContact(user: User, id: string): Promise<void> {
  const repo = getRepository();
  const contact = await repo.getContact(user.id, id);
  if (!contact) throw new ApiError("CONTACT_NOT_FOUND", "Contact not found.");
  await repo.deleteContact(user.id, id);
  if (contact.isPrimary) {
    const [next] = await repo.listContacts(user.id);
    if (next) await repo.setPrimaryContact(user.id, next.id);
  }
  await audit({ userId: user.id, actor: "user", action: "contact.deleted", targetType: "contact", targetId: id });
}

/** Sends a clearly-labelled test message so she knows the contact will really receive alerts. */
export async function sendTestNotification(user: User, id: string, channels?: Channel[]) {
  const repo = getRepository();
  const contact = await repo.getContact(user.id, id);
  if (!contact) throw new ApiError("CONTACT_NOT_FOUND", "Contact not found.");
  const planned = await planContactNotifications(user, [contact], "test", {}, channels);
  if (planned.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "This contact has no notification channel turned on.");
  }
  await dispatchNotifications(planned);
  const ids = new Set(planned.map((p) => p.id));
  const results = (await repo.listUserNotifications(user.id, 50)).filter((n) => ids.has(n.id));
  await audit({ userId: user.id, actor: "user", action: "contact.test_sent", targetType: "contact", targetId: id });
  return results.map((n) => ({ channel: n.channel, status: n.status, recipientMasked: n.recipientMasked, error: n.lastError }));
}
