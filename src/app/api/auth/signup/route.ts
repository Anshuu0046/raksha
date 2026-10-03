import { readJson, route } from "@/lib/api/route";
import { signupWithPassword } from "@/lib/auth/accounts";
import { respondWithSession } from "@/lib/auth/respond";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { signupSchema } from "@/lib/validation";

export const POST = route({ auth: "none", rateLimit: RATE_LIMITS.signup }, async ({ req }) => {
  const input = await readJson(req, signupSchema);
  const user = await signupWithPassword(input);
  return respondWithSession(user, input.client ?? "web", req);
});
