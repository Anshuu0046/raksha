import { z } from "zod";
import { readJson, route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { pushSubscriptionSchema } from "@/lib/validation";

/** Registers this device for the user's own reminders (check-in / journey). */
export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth }) => {
  const sub = await readJson(req, pushSubscriptionSchema);
  await getRepository().upsertPushSubscription({
    userId: auth.user.id,
    contactId: null,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  });
  return { subscribed: true };
});

export const DELETE = route({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth }) => {
  const { endpoint } = await readJson(req, z.object({ endpoint: z.string().url() }));
  const repo = getRepository();
  const mine = await repo.listPushSubscriptions({ userId: auth.user.id });
  if (mine.some((s) => s.endpoint === endpoint)) await repo.deletePushSubscription(endpoint);
  return { unsubscribed: true };
});
