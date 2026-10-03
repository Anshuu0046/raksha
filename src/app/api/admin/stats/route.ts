import { route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";
import { providerStatus } from "@/lib/env";
import { audit } from "@/lib/security/audit";

/**
 * Admin overview. Aggregates and delivery health only: no coordinates, addresses, names or
 * contact details. Admins cannot browse anyone's location history through this API.
 */
export const GET = route({ auth: "admin" }, async ({ auth, ipHash }) => {
  const repo = getRepository();
  const [stats, dbOk, recent, auditLog] = await Promise.all([
    repo.adminStats(new Date().toISOString()),
    repo.ping(),
    repo.listEmergencySummaries(25),
    repo.listAudit(40),
  ]);
  await audit({ userId: auth.user.id, actor: "admin", action: "admin.viewed_stats", ipHash });
  return {
    stats,
    health: { database: dbOk ? "ok" : "down", providers: providerStatus(), time: new Date().toISOString() },
    recentEmergencies: recent,
    audit: auditLog.map((a) => ({ id: a.id, action: a.action, actor: a.actor, targetType: a.targetType, createdAt: a.createdAt })),
  };
});
