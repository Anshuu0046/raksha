"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/misc";
import type { MapPoint } from "./leaflet-map";

export type { MapPoint } from "./leaflet-map";

/** Leaflet is ~40 kB and touches window: load it only where a map is shown, never on the SOS path. */
const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

class MapBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function LocationMap(props: {
  center: { lat: number; lng: number };
  accuracy?: number | null;
  points: MapPoint[];
  zoom?: number;
  className?: string;
  label: string;
  failedLabel: string;
  onSelect?: (id: string) => void;
}) {
  const { className, failedLabel, ...rest } = props;
  return (
    <div className={className}>
      <MapBoundary
        fallback={
          <div role="status" className="grid size-full place-items-center bg-ground p-6 text-center text-sm text-ink-2">
            {failedLabel}
          </div>
        }
      >
        <LeafletMap {...rest} className="size-full" />
      </MapBoundary>
    </div>
  );
}
