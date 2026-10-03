import { isDemoMode, serverEnv } from "@/lib/env";
import type { LatLng } from "@/lib/location/geo";
import { fetchWithTimeout, TtlCache } from "./cache";
import { DEMO_ADDRESS } from "./demo";

const reverseCache = new TtlCache<string | null>(30 * 60_000);
const searchCache = new TtlCache<GeocodeResult[]>(30 * 60_000);

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

function nominatimHeaders(): HeadersInit {
  // Nominatim's usage policy requires an identifying User-Agent and limits to 1 req/s.
  // For a pilot, point NOMINATIM_URL at a commercial or self-hosted instance.
  const contact = serverEnv.geoContactEmail();
  return { "User-Agent": `Raksha/1.0${contact ? ` (${contact})` : ""}`, "Accept-Language": "en" };
}

/** Human-readable address for a position, or null when unavailable. Never throws. */
export async function reverseGeocode(p: LatLng, language = "en"): Promise<string | null> {
  if (isDemoMode()) return DEMO_ADDRESS;
  // Round to ~11 m: enough for a street address, and keeps the cache useful.
  const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)},${language}`;
  const hit = reverseCache.get(key);
  if (hit !== undefined) return hit;
  try {
    const url = `${serverEnv.nominatimUrl()}/reverse?format=jsonv2&zoom=17&addressdetails=0&lat=${p.lat.toFixed(5)}&lon=${p.lng.toFixed(5)}&accept-language=${encodeURIComponent(language)}`;
    const res = await fetchWithTimeout(url, { headers: nominatimHeaders() }, 5000);
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const body = (await res.json()) as { display_name?: string };
    const label = body.display_name ? body.display_name.split(",").slice(0, 5).join(",").trim() : null;
    reverseCache.set(key, label);
    return label;
  } catch (err) {
    console.error("[raksha] reverse geocode failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function searchPlaces(q: string, near?: LatLng): Promise<GeocodeResult[]> {
  if (isDemoMode() && near) {
    return [
      { label: `${q} (simulated)`, lat: near.lat + 0.018, lng: near.lng + 0.012 },
      { label: `${q}, Railway Station area (simulated)`, lat: near.lat - 0.021, lng: near.lng + 0.006 },
    ];
  }
  const key = `${q.toLowerCase()}|${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ""}`;
  const hit = searchCache.get(key);
  if (hit) return hit;
  try {
    const params = new URLSearchParams({ format: "jsonv2", q, limit: "5", countrycodes: "in" });
    if (near) {
      const d = 0.5;
      params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
    }
    const res = await fetchWithTimeout(`${serverEnv.nominatimUrl()}/search?${params}`, { headers: nominatimHeaders() }, 6000);
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const body = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    const results = body.map((r) => ({
      label: r.display_name.split(",").slice(0, 4).join(",").trim(),
      lat: Number(r.lat),
      lng: Number(r.lon),
    }));
    searchCache.set(key, results);
    return results;
  } catch (err) {
    console.error("[raksha] geocode search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
