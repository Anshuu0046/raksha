import { readJson, route } from "@/lib/api/route";
import { verifyOtp } from "@/lib/auth/accounts";
import { respondWithSession } from "@/lib/auth/respond";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { otpVerifySchema } from "@/lib/validation";

export const POST = route({ auth: "none", rateLimit: RATE_LIMITS.otpVerify }, async ({ req }) => {
  const input = await readJson(req, otpVerifySchema);
  await enforceRateLimit(RATE_LIMITS.otpVerify, `phone:${input.phone}`);
  const locale = req.headers.get("accept-language")?.slice(0, 2) ?? "en";
  const { user, created } = await verifyOtp(input.phone, input.code, input.name, locale);
  return respondWithSession(user, input.client ?? "web", req, { created });
});
