import { ApiError } from "@/lib/api/errors";
import { isDemoMode, serverEnv } from "@/lib/env";
import { coarsen, distanceMeters, type LatLng } from "@/lib/location/geo";
import type { NearbyPlace } from "@/types";
import { fetchWithTimeout, TtlCache } from "./cache";
import { demoNearbyPlaces } from "./demo";

export type NearbyCategory = NearbyPlace["category"] | "all";

const cache = new TtlCache<NearbyPlace[]>(10 * 60_000);

const OSM_FILTERS: Record<NearbyPlace["category"], string[]> = {
  police: ['["amenity"="police"]'],
  hospital: ['["amenity"="hospital"]'],
  clinic: ['["amenity"="clinic"]', '["amenity"="doctors"]'],
  pharmacy: ['["amenity"="pharmacy"]'],
  emergency: ['["emergency"="ambulance_station"]', '["amenity"="fire_station"]', '["healthcare"="emergency"]'],
};

function categoriesFor(category: NearbyCategory): NearbyPlace["category"][] {
  return category === "all" ? ["police", "hospital", "clinic", "pharmacy", "emergency"] : [category];
}

function osmCategory(tags: Record<string, string>): NearbyPlace["category"] {
  if (tags.amenity === "police") return "police";
  if (tags.amenity === "hospital") return "hospital";
  if (tags.amenity === "pharmacy") return "pharmacy";
  if (tags.amenity === "clinic" || tags.amenity === "doctors") return "clinic";
  return "emergency";
}

function osmAddress(tags: Record<string, string>): string | null {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"] ?? tags["addr:neighbourhood"],
    tags["addr:city"] ?? tags["addr:district"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : tags["addr:full"] ?? null;
}

/**
 * opening_hours is a rich grammar; we only claim what we can be sure of: "24/7".
 * Everything else is shown verbatim with an "unknown" status rather than guessed.
 */
function osmOpenStatus(tags: Record<string, string>): Pick<NearbyPlace, "openStatus" | "hoursText"> {
  const hours = tags.opening_hours?.trim();
  if (!hours) {
    // Police stations and hospitals with emergency departments are typically 24h, but we do not assert it.
    return { openStatus: "unknown", hoursText: null };
  }
  if (hours === "24/7") return { openStatus: "24h", hoursText: null };
  return { openStatus: "unknown", hoursText: hours.slice(0, 80) };
}

async function fromOverpass(center: LatLng, radius: number, category: NearbyCategory): Promise<NearbyPlace[]> {
  const around = `(around:${radius},${center.lat},${center.lng})`;
  const clauses = categoriesFor(category)
    .flatMap((c) => OSM_FILTERS[c])
    .flatMap((f) => [`node${f}${around};`, `way${f}${around};`])
    .join("");
  const query = `[out:json][timeout:10];(${clauses});out center tags 120;`;
  const res = await fetchWithTimeout(serverEnv.overpassUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Raksha/1.0 (safety app)" },
    body: `data=${encodeURIComponent(query)}`,
  }, 12_000);
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const body = (await res.json()) as {
    elements: Array<{ id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>;
  };
  return body.elements
    .map((el): NearbyPlace | null => {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      const tags = el.tags ?? {};
      if (lat == null || lng == null) return null;
      const cat = osmCategory(tags);
      return {
        id: `osm-${el.type}-${el.id}`,
        name: tags.name ?? tags["name:en"] ?? "",
        category: cat,
        lat,
        lng,
        distanceMeters: 0,
        address: osmAddress(tags),
        phone: tags.phone ?? tags["contact:phone"] ?? tags["emergency:phone"] ?? null,
        ...osmOpenStatus(tags),
        source: "openstreetmap",
      };
    })
    .filter((p): p is NearbyPlace => p !== null);
}

const GOOGLE_TYPES: Record<NearbyPlace["category"], string[]> = {
  police: ["police"],
  hospital: ["hospital"],
  clinic: ["doctor", "medical_clinic"],
  pharmacy: ["pharmacy", "drugstore"],
  emergency: ["fire_station"],
};

async function fromGooglePlaces(center: LatLng, radius: number, category: NearbyCategory): Promise<NearbyPlace[]> {
  const cats = categoriesFor(category);
  const results = await Promise.all(
    cats.map(async (cat) => {
      const res = await fetchWithTimeout("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": serverEnv.googlePlacesKey(),
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.location,places.formattedAddress,places.nationalPhoneNumber,places.currentOpeningHours.openNow,places.regularOpeningHours.periods",
        },
        body: JSON.stringify({
          includedTypes: GOOGLE_TYPES[cat],
          maxResultCount: 10,
          rankPreference: "DISTANCE",
          locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius } },
        }),
      });
      if (!res.ok) throw new Error(`Places ${res.status}`);
      const body = (await res.json()) as {
        places?: Array<{
          id: string;
          displayName?: { text: string };
          location: { latitude: number; longitude: number };
          formattedAddress?: string;
          nationalPhoneNumber?: string;
          currentOpeningHours?: { openNow?: boolean };
          regularOpeningHours?: { periods?: Array<{ close?: unknown }> };
        }>;
      };
      return (body.places ?? []).map((p): NearbyPlace => {
        const always = p.regularOpeningHours?.periods?.length === 1 && !p.regularOpeningHours.periods[0]?.close;
        const openNow = p.currentOpeningHours?.openNow;
        return {
          id: `g-${p.id}`,
          name: p.displayName?.text ?? "",
          category: cat,
          lat: p.location.latitude,
          lng: p.location.longitude,
          distanceMeters: 0,
          address: p.formattedAddress ?? null,
          phone: p.nationalPhoneNumber ?? null,
          openStatus: always ? "24h" : openNow === true ? "open" : openNow === false ? "closed" : "unknown",
          hoursText: null,
          source: "google",
        };
      });
    }),
  );
  return results.flat();
}

/**
 * Finds nearby emergency facilities sorted by distance from the user's exact position.
 * The third-party query uses a coarsened (~110 m) position so exact location never leaves Raksha.
 */
export async function findNearby(position: LatLng, category: NearbyCategory, radius: number): Promise<NearbyPlace[]> {
  if (isDemoMode()) return sortByDistance(demoNearbyPlaces(position, category), position);

  const coarse = coarsen(position);
  const provider = serverEnv.googlePlacesKey() ? "google" : "osm";
  const key = `${provider}:${coarse.lat}:${coarse.lng}:${category}:${radius}`;
  let places = cache.get(key);
  if (!places) {
    try {
      places =
        provider === "google"
          ? await fromGooglePlaces(coarse, radius, category)
          : await fromOverpass(coarse, radius, category);
      // Widen once if the area is sparse (rural areas): emergency help may be further away.
      if (places.length < 3 && radius < 15_000) {
        places =
          provider === "google"
            ? await fromGooglePlaces(coarse, 15_000, category)
            : await fromOverpass(coarse, 15_000, category);
      }
    } catch (err) {
      console.error("[raksha] nearby lookup failed:", err instanceof Error ? err.message : err);
      throw new ApiError("UPSTREAM_UNAVAILABLE", "Nearby places are unavailable right now. Emergency numbers still work.");
    }
    cache.set(key, places);
  }
  return sortByDistance(places, position);
}

function sortByDistance(places: NearbyPlace[], position: LatLng): NearbyPlace[] {
  const seen = new Set<string>();
  return places
    .map((p) => ({ ...p, distanceMeters: Math.round(distanceMeters(position, p)) }))
    .filter((p) => {
      const dedupe = `${p.category}:${p.name.toLowerCase()}:${p.lat.toFixed(3)}:${p.lng.toFixed(3)}`;
      if (seen.has(dedupe)) return false;
      seen.add(dedupe);
      return true;
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 40);
}
