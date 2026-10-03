import { readQuery, route } from "@/lib/api/route";
import { searchPlaces } from "@/lib/maps/geocode";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { geocodeSearchSchema } from "@/lib/validation";

export const GET = route({ auth: "user", rateLimit: RATE_LIMITS.geocode }, async ({ req }) => {
  const { q, lat, lng } = readQuery(req, geocodeSearchSchema);
  return { results: await searchPlaces(q, lat != null && lng != null ? { lat, lng } : undefined) };
});
