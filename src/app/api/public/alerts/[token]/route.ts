import { ApiError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { hashToken, looksLikeToken } from "@/lib/security/tokens";
import { firstName } from "@/lib/utils";
import { pushSubscriptionSchema } from "@/lib/validation";

type Params = { token: string };

async function contactFor(token: string) {
  if (!looksLikeToken(token)) throw new ApiError("TOKEN_INVALID", "This invite link is not valid.");
  const contact = await getRepository().getContactByAlertTokenHash(hashToken(token));
  if (!contact) throw new ApiError("TOKEN_INVALID", "This invite link is not valid or was replaced by a newer one.");
  const owner = await getRepository().getUserById(contact.userId);
  if (!owner) throw new ApiError("TOKEN_INVALID", "This invite link is not valid.");
  return { contact, owner };
}

/** Shows the contact who invited them, by first name only. */
export const GET = route<Params>({ auth: "none", rateLimit: RATE_LIMITS.publicView }, async ({ params }) => {
  const { contact, owner } = await contactFor(params.token);
  return { ownerName: firstName(owner.name), contactName: firstName(contact.name) };
});

/** A trusted contact opts this device in to instant emergency push alerts. */
export const POST = route<Params>({ auth: "none", rateLimit: RATE_LIMITS.publicSubscribe }, async ({ req, params }) => {
  const { contact } = await contactFor(params.token);
  const sub = await readJson(req, pushSubscriptionSchema);
  await getRepository().upsertPushSubscription({
    userId: null,
    contactId: contact.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  });
  await audit({ userId: contact.userId, actor: "contact", action: "contact.push_enabled", targetType: "contact", targetId: contact.id });
  return { subscribed: true };
});
