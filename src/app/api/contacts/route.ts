import { json, readJson, route } from "@/lib/api/route";
import { createContact, toContactView } from "@/lib/contacts/service";
import { getRepository } from "@/lib/db";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { contactCreateSchema } from "@/lib/validation";

export const GET = route({ auth: "user" }, async ({ auth }) => {
  const contacts = await getRepository().listContacts(auth.user.id);
  return { contacts: await Promise.all(contacts.map(toContactView)) };
});

export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ req, auth }) => {
  const input = await readJson(req, contactCreateSchema);
  const contact = await createContact(auth.user, input);
  return json({ contact: await toContactView(contact) }, { status: 201 });
});
