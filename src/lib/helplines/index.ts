import { EMERGENCY_NUMBERS, PRIMARY_DIAL } from "@/config/emergencyNumbers";
import type { EmergencyNumber } from "@/types";

export function configNumbers(): EmergencyNumber[] {
  return EMERGENCY_NUMBERS.map(({ source: _source, ...n }) => ({
    ...n,
    active: true,
    updatedAt: "1970-01-01T00:00:00.000Z",
  }));
}

/**
 * Resolves the helplines that apply to a region.
 * Precedence (highest first): DB override for the state → config for the state →
 * DB override nationwide → config nationwide. Matching is by `id`, so a state can
 * replace a national entry (e.g. a different ambulance number) or add its own.
 */
export function resolveHelplines(region: string, overrides: EmergencyNumber[] = []): EmergencyNumber[] {
  const country = region.split("-")[0] || "IN";
  const all = [...configNumbers(), ...overrides];
  const byId = new Map<string, EmergencyNumber>();
  const rank = (n: EmergencyNumber, fromDb: boolean) => (n.region === region ? 2 : 0) + (fromDb ? 1 : 0);
  const ranks = new Map<string, number>();
  all.forEach((n, i) => {
    const fromDb = i >= EMERGENCY_NUMBERS.length;
    if (n.country !== country) return;
    if (n.region !== country && n.region !== region) return;
    const r = rank(n, fromDb);
    if ((ranks.get(n.id) ?? -1) <= r) {
      ranks.set(n.id, r);
      byId.set(n.id, n);
    }
  });
  return [...byId.values()].filter((n) => n.active).sort((a, b) => a.priority - b.priority);
}

export function primaryNumbers(helplines: EmergencyNumber[]) {
  const find = (id: string, fallback: string) => helplines.find((h) => h.id === id)?.number ?? fallback;
  return {
    emergency: find(PRIMARY_DIAL.emergency, "112"),
    police: find(PRIMARY_DIAL.police, "112"),
    ambulance: find(PRIMARY_DIAL.ambulance, "112"),
  };
}
