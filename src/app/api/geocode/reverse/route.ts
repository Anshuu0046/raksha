import { readQuery, route } from "@/lib/api/route";
import { reverseGeocode } from "@/lib/maps/geocode";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { reverseGeocodeSchema } from "@/lib/validation";

export const GET = route({ auth: "user", rateLimit: RATE_LIMITS.geocode }, async ({ req, auth }) => {
  const { lat, lng } = readQuery(req, reverseGeocodeSchema);
  return { address: await reverseGeocode({ lat, lng }, auth.user.locale) };
});
