import { json, readJson, route } from "@/lib/api/route";
import { startJourney } from "@/lib/emergency/safety-timers";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { journeyStartSchema } from "@/lib/validation";

export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth }) => {
  const input = await readJson(req, journeyStartSchema);
  const journey = await startJourney(auth.user, input);
  return json({ journey, serverTime: new Date().toISOString() }, { status: 201 });
});
