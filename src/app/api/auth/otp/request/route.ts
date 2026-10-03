import { readJson, route } from "@/lib/api/route";
import { requestOtp } from "@/lib/auth/accounts";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { otpRequestSchema } from "@/lib/validation";

export const POST = route({ auth: "none", rateLimit: RATE_LIMITS.otpRequest }, async ({ req }) => {
  const { phone } = await readJson(req, otpRequestSchema);
  // Also limit per destination number so one attacker cannot SMS-bomb a victim from many IPs.
  await enforceRateLimit(RATE_LIMITS.otpRequest, `phone:${phone}`);
  const locale = req.headers.get("accept-language")?.slice(0, 2) ?? "en";
  const result = await requestOtp(phone, locale);
  return { sent: true, phone, ...result };
});
