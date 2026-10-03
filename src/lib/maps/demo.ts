import type { LatLng } from "@/lib/location/geo";
import type { NearbyPlace } from "@/types";
import type { NearbyCategory } from "./nearby";

/**
 * Synthetic facilities for demo mode. Every name is marked "(demo)" so nobody mistakes
 * them for real places. Positions are offsets from the (simulated) user position.
 */
const DEMO_PLACES: Array<Omit<NearbyPlace, "lat" | "lng" | "distanceMeters" | "source"> & { dLat: number; dLng: number }> = [
  { id: "demo-police-1", name: "City Police Station (demo)", category: "police", dLat: 0.0061, dLng: 0.0042, address: "Station Road (demo)", phone: "100", openStatus: "24h", hoursText: null },
  { id: "demo-police-2", name: "Women Police Station (demo)", category: "police", dLat: -0.0093, dLng: 0.0118, address: "Market Square (demo)", phone: "1091", openStatus: "24h", hoursText: null },
  { id: "demo-police-3", name: "Traffic Police Outpost (demo)", category: "police", dLat: 0.0151, dLng: -0.0101, address: "Ring Road (demo)", phone: null, openStatus: "unknown", hoursText: null },
  { id: "demo-hospital-1", name: "District Hospital (demo)", category: "hospital", dLat: -0.0042, dLng: -0.0071, address: "Hospital Road (demo)", phone: "108", openStatus: "24h", hoursText: null },
  { id: "demo-hospital-2", name: "Care Multispeciality Hospital (demo)", category: "hospital", dLat: 0.0122, dLng: 0.0153, address: "Lake View Colony (demo)", phone: null, openStatus: "open", hoursText: null },
  { id: "demo-clinic-1", name: "Family Health Clinic (demo)", category: "clinic", dLat: 0.0021, dLng: -0.0032, address: "Temple Lane (demo)", phone: null, openStatus: "closed", hoursText: "Mo-Sa 09:00-20:00" },
  { id: "demo-pharmacy-1", name: "24h Medical Store (demo)", category: "pharmacy", dLat: -0.0018, dLng: 0.0026, address: "Bus Stand (demo)", phone: null, openStatus: "24h", hoursText: null },
  { id: "demo-pharmacy-2", name: "Wellness Pharmacy (demo)", category: "pharmacy", dLat: 0.0073, dLng: -0.0059, address: "College Road (demo)", phone: null, openStatus: "open", hoursText: "08:00-23:00" },
  { id: "demo-emergency-1", name: "Fire & Rescue Station (demo)", category: "emergency", dLat: -0.0134, dLng: -0.0047, address: "Industrial Estate (demo)", phone: "101", openStatus: "24h", hoursText: null },
];

export function demoNearbyPlaces(center: LatLng, category: NearbyCategory): NearbyPlace[] {
  return DEMO_PLACES.filter((p) => category === "all" || p.category === category).map(({ dLat, dLng, ...p }) => ({
    ...p,
    lat: center.lat + dLat,
    lng: center.lng + dLng,
    distanceMeters: 0,
    source: "demo",
  }));
}

/** Simulated position used in demo mode instead of real GPS (Bhubaneswar city centre). */
export const DEMO_POSITION = { lat: 20.2961, lng: 85.8245, accuracy: 18 } as const;
export const DEMO_ADDRESS = "Janpath, Bhubaneswar, Odisha (simulated)";
