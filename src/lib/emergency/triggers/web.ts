import type { TriggerMethod } from "@/types";
import type { EmergencyTriggerCapabilities, EmergencyTriggerProvider, TriggerListener } from "./types";

/**
 * Browser / PWA trigger provider. Supports only what browsers allow: on-screen hold, triple tap
 * and keyboard activation. Hardware buttons are explicitly reported as unsupported.
 */
export class WebEmergencyTriggerProvider implements EmergencyTriggerProvider {
  readonly platform = "web" as const;
  private listeners = new Set<TriggerListener>();

  capabilities(): EmergencyTriggerCapabilities {
    return {
      hold: true,
      tripleTap: true,
      keyboard: true,
      hardwareVolume: false,
      hardwarePower: false,
      lockScreen: false,
      backgroundDetection: false,
    };
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
  }
}
