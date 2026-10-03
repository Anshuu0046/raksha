import { z } from "zod";
import { route } from "@/lib/api/route";
import { sendTestNotification } from "@/lib/contacts/service";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export const maxDuration = 30;

export const POST = route<{ id: string }>({ auth: "user", rateLimit: RATE_LIMITS.testNotification }, async ({ auth, params }) => {
  const results = await sendTestNotification(auth.user, z.string().uuid().parse(params.id));
  return { results };
});
