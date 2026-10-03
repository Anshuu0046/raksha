"use client";

import { useEffect, useState } from "react";

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

export interface BatteryState {
  supported: boolean;
  level: number | null;
  charging: boolean | null;
}

/** Battery Status API (Chromium/Android only). Returns supported:false elsewhere. Never faked. */
export function useBattery(): BatteryState {
  const [state, setState] = useState<BatteryState>({ supported: false, level: null, charging: null });
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (!nav.getBattery) return;
    let battery: BatteryManager | null = null;
    const update = () => battery && setState({ supported: true, level: battery.level, charging: battery.charging });
    nav
      .getBattery()
      .then((b) => {
        battery = b;
        update();
        b.addEventListener("levelchange", update);
        b.addEventListener("chargingchange", update);
      })
      .catch(() => undefined);
    return () => {
      battery?.removeEventListener("levelchange", update);
      battery?.removeEventListener("chargingchange", update);
    };
  }, []);
  return state;
}

/** One-shot read for request payloads. */
export async function readBatteryLevel(): Promise<number | null> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (!nav.getBattery) return null;
    return (await nav.getBattery()).level;
  } catch {
    return null;
  }
}
