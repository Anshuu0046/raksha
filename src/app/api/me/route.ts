import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { json, readJson, route } from "@/lib/api/route";
import { clearSessionCookieHeader, toPublicUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { getRecordingStore } from "@/lib/storage/recordings";
import { profileUpdateSchema } from "@/lib/validation";

export const GET = route({ auth: "user" }, async ({ auth }) => {
  const repo = getRepository();
  const [contacts, activeEmergency, activeCheckIn, activeJourney] = await Promise.all([
    repo.listContacts(auth.user.id),
    repo.getActiveEmergency(auth.user.id),
    repo.getActiveCheckIn(auth.user.id),
    repo.getActiveJourney(auth.user.id),
  ]);
  return {
    user: toPublicUser(auth.user),
    contactCount: contacts.length,
    activeEmergencyId: activeEmergency?.id ?? null,
    activeCheckIn,
    activeJourney,
  };
});

export const PATCH = route({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth }) => {
  const input = await readJson(req, profileUpdateSchema);
  const repo = getRepository();
  if (input.phone && input.phone !== auth.user.phone) {
    const other = await repo.getUserByPhone(input.phone);
    if (other && other.id !== auth.user.id) throw new ApiError("PHONE_IN_USE", "This phone number is linked to another account.");
  }
  const user = await repo.updateUser(auth.user.id, {
    name: input.name,
    phone: input.phone === undefined ? undefined : input.phone,
    locale: input.locale,
    avatarUrl: input.avatarUrl === undefined ? undefined : input.avatarUrl,
    preferences: input.preferences ? { ...auth.user.preferences, ...input.preferences } : undefined,
    onboardedAt: input.onboarded && !auth.user.onboardedAt ? new Date().toISOString() : undefined,
  });
  return { user: toPublicUser(user) };
});

const deleteSchema = z.object({ confirm: z.literal("DELETE") });

/**
 * Secure deletion: removes recordings from storage, then hard-deletes the user and every row
 * they own (cascade). Audit entries are kept for integrity but pseudonymised (user id removed).
 */
export const DELETE = route({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth, ipHash }) => {
  await readJson(req, deleteSchema);
  const repo = getRepository();
  const recordings = await repo.listRecordings(auth.user.id);
  if (recordings.length > 0) {
    const store = getRecordingStore();
    await Promise.all(recordings.map((r) => store.delete(r.storageKey).catch(() => undefined)));
  }
  await audit({ userId: auth.user.id, actor: "user", action: "account.deleted", ipHash, metadata: { recordings: recordings.length } });
  await repo.deleteUser(auth.user.id);
  return json({ deleted: true }, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
});
