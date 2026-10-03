import { AndroidEmergencyTriggerProvider, hasAndroidBridge } from "./android";
import type { EmergencyTriggerProvider } from "./types";
import { WebEmergencyTriggerProvider } from "./web";

export type { EmergencyTriggerCapabilities, EmergencyTriggerEvent, EmergencyTriggerProvider } from "./types";
export { AndroidEmergencyTriggerProvider } from "./android";
export { WebEmergencyTriggerProvider } from "./web";

/** Picks the native bridge when running inside Raksha Android, otherwise the browser provider. */
export function createEmergencyTriggerProvider(): EmergencyTriggerProvider {
  return hasAndroidBridge() ? new AndroidEmergencyTriggerProvider() : new WebEmergencyTriggerProvider();
}
