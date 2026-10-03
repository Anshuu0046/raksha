import { readJson, route } from "@/lib/api/route";
import { sendTestNotification } from "@/lib/contacts/service";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { notificationSendSchema } from "@/lib/validation";

export const maxDuration = 30;

/**
 * POST /api/notifications/send: client-initiated sends. Deliberately narrow: only "test"
 * messages to the caller's own contacts. Emergency alerts are sent by the server as a
 * consequence of /api/emergency/trigger, never by an arbitrary client request.
 */
export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.notificationsSend }, async ({ req, auth }) => {
  const input = await readJson(req, notificationSendSchema);
  const results = await sendTestNotification(auth.user, input.contactId, input.channels);
  return { results };
});
