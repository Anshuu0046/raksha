import type { TriggerMethod } from "@/types";

/**
 * What a platform can honestly do. The web build reports hardware triggers as unavailable:
 * browsers cannot observe power/volume buttons, and we never pretend otherwise.
 */
export interface EmergencyTriggerCapabilities {
  /** Press-and-hold on the on-screen SOS button. */
  hold: boolean;
  /** Three quick taps on the SOS button. */
  tripleTap: boolean;
  /** Hold Space/Enter while the SOS button is focused (keyboard and switch users). */
  keyboard: boolean;
  /** Repeated volume-button presses (native Android only). */
  hardwareVolume: boolean;
  /** Repeated power-button presses (native Android only, best effort, OS-dependent). */
  hardwarePower: boolean;
  /** Lock-screen shortcut / home-screen widget (native Android only). */
  lockScreen: boolean;
  /** Detects triggers while the app is not in the foreground (native Android foreground service). */
  backgroundDetection: boolean;
}

export interface EmergencyTriggerEvent {
  method: TriggerMethod;
  /** Epoch ms when the gesture completed on the device. */
  at: number;
}

export type TriggerListener = (event: EmergencyTriggerEvent) => void;

/**
 * Platform abstraction for "something asked for SOS". The emergency engine subscribes once and
 * does not care whether the trigger came from a touch gesture, a keyboard, or Android hardware.
 * Both Raksha Web and Raksha Android feed the same backend: POST /api/emergency/trigger.
 */
export interface EmergencyTriggerProvider {
  readonly platform: "web" | "android";
  capabilities(): EmergencyTriggerCapabilities;
  /** Subscribe to triggers. Returns an unsubscribe function. */
  subscribe(listener: TriggerListener): () => void;
  /** Called by on-screen controls (SOS button) to raise a trigger through the provider. */
  emit(method: TriggerMethod): void;
  dispose(): void;
}
