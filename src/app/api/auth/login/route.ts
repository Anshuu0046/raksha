import { readJson, route } from "@/lib/api/route";
import { loginWithPassword } from "@/lib/auth/accounts";
import { respondWithSession } from "@/lib/auth/respond";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { loginSchema } from "@/lib/validation";

export const POST = route({ auth: "none", rateLimit: RATE_LIMITS.login }, async ({ req }) => {
  const input = await readJson(req, loginSchema);
  const user = await loginWithPassword(input.email, input.password);
  return respondWithSession(user, input.client ?? "web", req);
});
