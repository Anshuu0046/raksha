import { json, readJson, route } from "@/lib/api/route";
import { triggerEmergency } from "@/lib/emergency/service";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { triggerSchema } from "@/lib/validation";

// Keep the function warm long enough for post-response notification delivery.
export const maxDuration = 60;

/**
 * POST /api/emergency/trigger. The hot path: validates, writes the event and pending
 * notifications, responds. Delivery happens after the response (see lib/server/background).
 */
export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.sosTrigger }, async ({ req, auth, ipHash }) => {
  const input = await readJson(req, triggerSchema);
  const { event, shareUrl, created } = await triggerEmergency(auth.user, input, { ipHash });
  return json(
    {
      eventId: event.id,
      status: event.status,
      startedAt: event.startedAt,
      shareUrl,
      created,
      isDemo: event.isDemo,
    },
    { status: created ? 201 : 200 },
  );
});
