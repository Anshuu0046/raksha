import { route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";

/** GET /api/history: emergencies, check-ins and journeys for the timeline. Coordinates excluded. */
export const GET = route({ auth: "user" }, async ({ auth }) => {
  const repo = getRepository();
  const [events, checkIns, journeys, recordings] = await Promise.all([
    repo.listEmergencies(auth.user.id, 100),
    repo.listCheckIns(auth.user.id, 100),
    repo.listJourneys(auth.user.id, 100),
    repo.listRecordings(auth.user.id),
  ]);
  const emergencies = await Promise.all(
    events.map(async (e) => {
      const notes = await repo.listNotifications({ eventId: e.id });
      const sos = notes.filter((n) => n.kind !== "emergency_ended");
      const reached = new Set(sos.filter((n) => n.status === "sent" || n.status === "simulated").map((n) => n.contactId));
      return {
        id: e.id,
        status: e.status,
        triggerMethod: e.triggerMethod,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        endReason: e.endReason,
        address: e.address,
        hadLocation: e.startLat !== null,
        isDemo: e.isDemo,
        contactsNotified: reached.size,
        notificationsFailed: sos.filter((n) => n.status === "failed").length,
        recordings: recordings.filter((r) => r.eventId === e.id).length,
      };
    }),
  );
  return {
    emergencies,
    checkIns: checkIns.map(({ lastLat: _a, lastLng: _b, ...c }) => c),
    journeys: journeys.map(({ lastLat: _a, lastLng: _b, startLat: _c, startLng: _d, destLat: _e, destLng: _f, ...j }) => j),
  };
});
