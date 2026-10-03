/** Pure geo helpers, safe for both server and client. */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters: number, locale = "en-IN"): string {
  if (meters < 1000) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(meters / 10) * 10)} m`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

export function formatCoords(p: LatLng, digits = 5): string {
  return `${p.lat.toFixed(digits)}, ${p.lng.toFixed(digits)}`;
}

/** Opens the point in the device's map app (Google Maps handles both web and Android intents). */
export function mapLink(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

export function directionsLink(p: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

/**
 * Coarsens a coordinate before it is sent to a third-party API (places, geocoding), so
 * exact positions do not leave Raksha's servers. ~110 m at 3 decimals.
 */
export function coarsen(p: LatLng, decimals = 3): LatLng {
  const f = 10 ** decimals;
  return { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
}

export type AccuracyLevel = "high" | "medium" | "low";

export function accuracyLevel(accuracyMeters: number | null | undefined): AccuracyLevel {
  if (accuracyMeters == null) return "low";
  if (accuracyMeters <= 30) return "high";
  if (accuracyMeters <= 150) return "medium";
  return "low";
}
