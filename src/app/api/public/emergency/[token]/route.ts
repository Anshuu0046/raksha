import { json, route } from "@/lib/api/route";
import { resolvePublicEmergency } from "@/lib/emergency/service";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * GET /api/public/emergency/[token]: what a trusted contact's link shows. No account needed;
 * the random token is the credential. Responses are never cached or indexed.
 */
export const GET = route<{ token: string }>({ auth: "none", rateLimit: RATE_LIMITS.publicView }, async ({ params }) => {
  const view = await resolvePublicEmergency(params.token);
  return json(view, { headers: { "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
});
