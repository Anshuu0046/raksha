import { z } from "zod";
import { readQuery, route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";
import { resolveHelplines } from "@/lib/helplines";

const query = z.object({ region: z.string().regex(/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/).optional() });

/** Public: helplines must be reachable even when signed out. */
export const GET = route({ auth: "optional" }, async ({ req, auth }) => {
  const { region } = readQuery(req, query);
  const r = region ?? auth?.user.preferences.region ?? "IN";
  const overrides = await getRepository().listEmergencyNumbers().catch(() => []);
  return { region: r, helplines: resolveHelplines(r, overrides) };
});
