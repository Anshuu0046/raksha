import { z } from "zod";
import { SUPPORTED_REGIONS } from "@/config/emergencyNumbers";
import { readJson, route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";
import { configNumbers } from "@/lib/helplines";
import { audit } from "@/lib/security/audit";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { emergencyNumberSchema } from "@/lib/validation";

export const GET = route({ auth: "admin" }, async () => ({
  config: configNumbers(),
  overrides: await getRepository().listEmergencyNumbers(),
  regions: SUPPORTED_REGIONS,
}));

/** Create or override a helpline. Takes effect immediately for every client. */
export const PUT = route({ auth: "admin", rateLimit: RATE_LIMITS.write }, async ({ req, auth, ipHash }) => {
  const input = await readJson(req, emergencyNumberSchema);
  const saved = await getRepository().upsertEmergencyNumber({ ...input, updatedAt: new Date().toISOString() });
  await audit({ userId: auth.user.id, actor: "admin", action: "helpline.upserted", targetType: "emergency_number", targetId: saved.id, ipHash, metadata: { region: saved.region, number: saved.number } });
  return { helpline: saved };
});

export const DELETE = route({ auth: "admin", rateLimit: RATE_LIMITS.write }, async ({ req, auth, ipHash }) => {
  const { id } = await readJson(req, z.object({ id: z.string().min(1).max(60) }));
  await getRepository().deleteEmergencyNumber(id);
  await audit({ userId: auth.user.id, actor: "admin", action: "helpline.override_removed", targetType: "emergency_number", targetId: id, ipHash });
  return { deleted: true };
});
