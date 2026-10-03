import { json, readJson, route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";
import { startCheckIn } from "@/lib/emergency/safety-timers";
import { maybeProcess } from "@/lib/scheduler";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { checkInStartSchema } from "@/lib/validation";

/** GET /api/checkin: the active check-in, if any. */
export const GET = route({ auth: "user" }, async ({ auth }) => {
  maybeProcess();
  const checkIn = await getRepository().getActiveCheckIn(auth.user.id);
  return { checkIn, serverTime: new Date().toISOString() };
});

/** POST /api/checkin: start a safety check-in timer. */
export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth }) => {
  const input = await readJson(req, checkInStartSchema);
  const checkIn = await startCheckIn(auth.user, input.minutes, input.note, input.location);
  return json({ checkIn, serverTime: new Date().toISOString() }, { status: 201 });
});
