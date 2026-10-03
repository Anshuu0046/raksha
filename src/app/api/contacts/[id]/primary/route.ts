import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export const POST = route<{ id: string }>({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ auth, params }) => {
  const id = z.string().uuid().parse(params.id);
  const ok = await getRepository().setPrimaryContact(auth.user.id, id);
  if (!ok) throw new ApiError("CONTACT_NOT_FOUND", "Contact not found.");
  return { primaryContactId: id };
});
