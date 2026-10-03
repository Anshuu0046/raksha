import { readJson, route } from "@/lib/api/route";
import { resetPassword } from "@/lib/auth/accounts";
import { respondWithSession } from "@/lib/auth/respond";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { passwordResetSchema } from "@/lib/validation";

export const POST = route({ auth: "none", rateLimit: RATE_LIMITS.passwordReset }, async ({ req }) => {
  const { token, password } = await readJson(req, passwordResetSchema);
  const user = await resetPassword(token, password);
  return respondWithSession(user, "web", req);
});
