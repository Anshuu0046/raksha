import { ApiError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";
import { endEmergency } from "@/lib/emergency/service";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { cancelSchema } from "@/lib/validation";

/** POST /api/emergency/cancel: reason "safe" resolves; "mistake"/"other" cancels. Contacts are told. */
export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth, ipHash }) => {
  const input = await readJson(req, cancelSchema);
  let eventId = input.eventId;
  if (!eventId && input.clientEventId) {
    const event = await getRepository().getEmergencyByClientId(auth.user.id, input.clientEventId);
    // The trigger never reached the server: nothing to cancel, nobody was alerted.
    if (!event) return { eventId: null, status: "cancelled", endedAt: new Date().toISOString(), neverSent: true };
    eventId = event.id;
  }
  if (!eventId) throw new ApiError("VALIDATION_ERROR", "eventId or clientEventId is required.");
  const event = await endEmergency(auth.user, eventId, input.reason, { ipHash });
  return { eventId: event.id, status: event.status, endedAt: event.endedAt, neverSent: false };
});
