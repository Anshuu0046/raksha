import { z } from "zod";
import { readQuery, route } from "@/lib/api/route";
import { getEmergencyStatus } from "@/lib/emergency/service";
import { maybeProcess } from "@/lib/scheduler";

const query = z.object({ eventId: z.string().uuid().optional() });

/** GET /api/emergency/status[?eventId=]: the active (or given) emergency with delivery status. */
export const GET = route({ auth: "user" }, async ({ req, auth }) => {
  const { eventId } = readQuery(req, query);
  maybeProcess();
  return { emergency: await getEmergencyStatus(auth.user, eventId) };
});
