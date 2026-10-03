import { z } from "zod";
import { readJson, route } from "@/lib/api/route";
import { deleteContact, toContactView, updateContact } from "@/lib/contacts/service";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { contactUpdateSchema } from "@/lib/validation";

type Params = { id: string };
const idSchema = z.string().uuid();

export const PATCH = route<Params>({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth, params }) => {
  const input = await readJson(req, contactUpdateSchema);
  const contact = await updateContact(auth.user, idSchema.parse(params.id), input);
  return { contact: await toContactView(contact) };
});

export const DELETE = route<Params>({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ auth, params }) => {
  await deleteContact(auth.user, idSchema.parse(params.id));
  return { deleted: true };
});
