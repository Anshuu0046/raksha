import { route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";
import { maybeProcess } from "@/lib/scheduler";

/** GET /api/journey: the active journey, if any. */
export const GET = route({ auth: "user" }, async ({ auth }) => {
  maybeProcess();
  const journey = await getRepository().getActiveJourney(auth.user.id);
  return { journey, serverTime: new Date().toISOString() };
});
