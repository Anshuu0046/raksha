import webpush from "web-push";
import { isDemoMode, serverEnv } from "@/lib/env";
import type { DeliveryResult, PushMessage, PushProvider, PushTarget } from "../types";

export class SimulatedPushProvider implements PushProvider {
  readonly name = "simulated-push";
  async send(_target: PushTarget, message: PushMessage): Promise<DeliveryResult> {
    console.info(`[raksha][demo] Push: ${message.title}`);
    return { status: "simulated", provider: this.name };
  }
}

class UnconfiguredPushProvider implements PushProvider {
  readonly name = "none";
  async send(): Promise<DeliveryResult> {
    return { status: "skipped", provider: this.name, error: "Web push not configured", permanent: true };
  }
}

/** Standard Web Push (VAPID). Works for Chrome/Android, Firefox, Edge and installed iOS PWAs. */
export class WebPushProvider implements PushProvider {
  readonly name = "web-push";
  constructor() {
    webpush.setVapidDetails(serverEnv.vapidSubject(), serverEnv.vapidPublicKey(), serverEnv.vapidPrivateKey());
  }
  async send(target: PushTarget, message: PushMessage) {
    try {
      const res = await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(message),
        { TTL: message.urgent ? 60 * 60 : 6 * 60 * 60, urgency: message.urgent ? "high" : "normal", timeout: 8000 },
      );
      return { status: "sent" as const, provider: this.name, messageId: res.headers?.location };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410: the browser unsubscribed. Remove the endpoint; do not retry.
      if (status === 404 || status === 410) {
        return { status: "failed" as const, provider: this.name, error: "Subscription expired", permanent: true, gone: true };
      }
      return { status: "failed" as const, provider: this.name, error: `Push failed (${status ?? "network"})` };
    }
  }
}

export function pushConfigured(): boolean {
  return Boolean(serverEnv.vapidPublicKey() && serverEnv.vapidPrivateKey());
}

export function getPushProvider(): PushProvider {
  if (isDemoMode()) return new SimulatedPushProvider();
  if (pushConfigured()) return new WebPushProvider();
  return new UnconfiguredPushProvider();
}
