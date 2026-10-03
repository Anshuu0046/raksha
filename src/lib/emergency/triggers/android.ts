import { TRIGGER_METHODS, type TriggerMethod } from "@/types";
import type { EmergencyTriggerCapabilities, EmergencyTriggerProvider, TriggerListener } from "./types";

/**
 * Contract between this web UI and the native Raksha Android shell (see docs/ANDROID.md).
 *
 * The Android app hosts the UI in a WebView (or reimplements it natively) and exposes:
 *   window.RakshaAndroid.getCapabilities(): string   // JSON EmergencyTriggerCapabilities
 *   window.RakshaAndroid.acknowledge(method: string)  // UI received the trigger
 * and, when its foreground service detects a configured hardware pattern, calls:
 *   window.__rakshaNativeTrigger(method)               // e.g. "hardware_volume"
 *
 * Native detection and the network call to POST /api/emergency/trigger happen in Kotlin, so an
 * SOS still goes out when the WebView is not running. This provider only keeps the UI in sync.
 */
export interface RakshaAndroidBridge {
  getCapabilities(): string;
  acknowledge(method: string): void;
}

declare global {
  interface Window {
    RakshaAndroid?: RakshaAndroidBridge;
    __rakshaNativeTrigger?: (method: string) => void;
  }
}

export function hasAndroidBridge(): boolean {
  return typeof window !== "undefined" && typeof window.RakshaAndroid?.getCapabilities === "function";
}

export class AndroidEmergencyTriggerProvider implements EmergencyTriggerProvider {
  readonly platform = "android" as const;
  private listeners = new Set<TriggerListener>();

  constructor(private readonly bridge: RakshaAndroidBridge = window.RakshaAndroid!) {
    window.__rakshaNativeTrigger = (method: string) => {
      const m = (TRIGGER_METHODS as readonly string[]).includes(method) ? (method as TriggerMethod) : "hardware_volume";
      this.emit(m);
      try {
        this.bridge.acknowledge(m);
      } catch {
        // The native side treats a missing ack as "UI not visible" and proceeds on its own.
      }
    };
  }

  capabilities(): EmergencyTriggerCapabilities {
    const fallback: EmergencyTriggerCapabilities = {
      hold: true,
      tripleTap: true,
      keyboard: true,
      hardwareVolume: false,
      hardwarePower: false,
      lockScreen: false,
      backgroundDetection: false,
    };
    try {
      return { ...fallback, ...(JSON.parse(this.bridge.getCapabilities()) as Partial<EmergencyTriggerCapabilities>) };
    } catch {
      return fallback;
    }
  }

  subscribe(listener: TriggerListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(method: TriggerMethod) {
    const event = { method, at: Date.now() };
    for (const l of this.listeners) l(event);
  }

  dispose() {
    this.listeners.clear();
    if (window.__rakshaNativeTrigger) delete window.__rakshaNativeTrigger;
  }
}
