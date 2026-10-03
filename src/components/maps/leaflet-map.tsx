"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind: "user" | "police" | "hospital" | "clinic" | "pharmacy" | "emergency" | "destination";
}

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const GLYPH: Record<MapPoint["kind"], string> = {
  user: "",
  police: "P",
  hospital: "H",
  clinic: "C",
  pharmacy: "+",
  emergency: "!",
  destination: "D",
};

function icon(kind: MapPoint["kind"]) {
  if (kind === "user") {
    return L.divIcon({
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      html: '<span style="display:block;width:28px;height:28px;border-radius:50%;background:#D91F2C;border:4px solid #fff;box-shadow:0 2px 8px rgb(13 27 42 / .45)"></span>',
    });
  }
  const bg = kind === "destination" ? "#12804A" : "#0D1B2A";
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:${bg};color:#fff;font:800 13px/1 system-ui;border:2px solid #fff;box-shadow:0 2px 6px rgb(13 27 42 / .35)">${GLYPH[kind]}</span>`,
  });
}

/** Thin imperative wrapper over Leaflet; re-renders markers when points change. */
export default function LeafletMap({
  center,
  accuracy,
  points,
  zoom = 15,
  className,
  label,
  onSelect,
}: {
  center: { lat: number; lng: number };
  accuracy?: number | null;
  points: MapPoint[];
  zoom?: number;
  className?: string;
  label: string;
  onSelect?: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
    // Map is created once; later prop changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    if (accuracy && accuracy > 0) {
      L.circle([center.lat, center.lng], { radius: accuracy, color: "#D91F2C", weight: 1, fillOpacity: 0.08 }).addTo(group);
    }
    for (const p of points) {
      const marker = L.marker([p.lat, p.lng], { icon: icon(p.kind), title: p.label, alt: p.label, keyboard: true }).addTo(group);
      if (onSelect) marker.on("click", () => onSelect(p.id));
    }
    if (!fitted.current && points.length > 1) {
      m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])).pad(0.15), { maxZoom: 16 });
      fitted.current = true;
    } else if (points.length <= 1) {
      m.setView([center.lat, center.lng], m.getZoom());
    }
  }, [center.lat, center.lng, accuracy, points, onSelect]);

  return <div ref={el} role="region" aria-label={label} className={className} />;
}
