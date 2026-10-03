import { readJson, route } from "@/lib/api/route";
import { requestPasswordReset } from "@/lib/auth/accounts";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { passwordResetRequestSchema } from "@/lib/validation";

export const POST = route({ auth: "none", rateLimit: RATE_LIMITS.passwordReset }, async ({ req }) => {
  const { email } = await readJson(req, passwordResetRequestSchema);
  const result = await requestPasswordReset(email);
  // Identical response whether or not the account exists.
  return { sent: true, ...result };
});
