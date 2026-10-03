import { readJson, route } from "@/lib/api/route";
import { recordLocations } from "@/lib/emergency/service";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { locationUpdateSchema } from "@/lib/validation";

/** POST /api/emergency/location: one or a batch (queued offline) of live-location points. */
export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.location }, async ({ req, auth }) => {
  const input = await readJson(req, locationUpdateSchema);
  const { stored, latest } = await recordLocations(auth.user, input.eventId, input.locations, input.batteryLevel);
  return { stored, latest };
});
