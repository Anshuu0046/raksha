import { readJson, route } from "@/lib/api/route";
import { finishJourney } from "@/lib/emergency/safety-timers";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { journeyCompleteSchema } from "@/lib/validation";

export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth }) => {
  const { journeyId, action } = await readJson(req, journeyCompleteSchema);
  const journey = await finishJourney(auth.user, journeyId, action);
  return { journey };
});
