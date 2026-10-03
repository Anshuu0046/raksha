import { readQuery, route } from "@/lib/api/route";
import { findNearby } from "@/lib/maps/nearby";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { nearbyQuerySchema } from "@/lib/validation";

export const GET = route({ auth: "user", rateLimit: RATE_LIMITS.nearby }, async ({ req }) => {
  const q = readQuery(req, nearbyQuerySchema);
  const places = await findNearby({ lat: q.lat, lng: q.lng }, q.category, q.radius);
  return { places };
});
