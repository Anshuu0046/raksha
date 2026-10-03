import { readJson, route } from "@/lib/api/route";
import { updateJourneyLocation } from "@/lib/emergency/safety-timers";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { journeyUpdateSchema } from "@/lib/validation";

/** Periodic position while a journey is active, used as "last known location" if it escalates. */
export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.location }, async ({ req, auth }) => {
  const { journeyId, location } = await readJson(req, journeyUpdateSchema);
  const journey = await updateJourneyLocation(auth.user, journeyId, location);
  return { journeyId: journey.id, lastLocationAt: journey.lastLocationAt };
});
