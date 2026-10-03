import { readJson, route } from "@/lib/api/route";
import { createOwnerShare } from "@/lib/emergency/service";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { shareCreateSchema } from "@/lib/validation";

/** POST /api/emergency/share: a fresh live-location link (optionally revoking all old ones). */
export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth }) => {
  const { eventId, revokeExisting } = await readJson(req, shareCreateSchema);
  return createOwnerShare(auth.user, eventId, revokeExisting);
});
