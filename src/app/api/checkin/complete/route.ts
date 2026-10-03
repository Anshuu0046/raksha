import { readJson, route } from "@/lib/api/route";
import { updateCheckIn } from "@/lib/emergency/safety-timers";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { checkInCompleteSchema } from "@/lib/validation";

/** POST /api/checkin/complete: "I'm safe" (complete), cancel, or extend the timer. */
export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth }) => {
  const input = await readJson(req, checkInCompleteSchema);
  const checkIn = await updateCheckIn(auth.user, input.checkInId, input.action, input.extendMinutes);
  return { checkIn, serverTime: new Date().toISOString() };
});
