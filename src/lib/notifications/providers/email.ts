import { isDemoMode, serverEnv } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/maps/cache";
import type { DeliveryResult, EmailMessage, EmailProvider } from "../types";

export class SimulatedEmailProvider implements EmailProvider {
  readonly name = "simulated-email";
  async send(message: EmailMessage): Promise<DeliveryResult> {
    console.info(`[raksha][demo] Email to ${message.to.slice(0, 2)}…: ${message.subject}`);
    return { status: "simulated", provider: this.name };
  }
}

class UnconfiguredEmailProvider implements EmailProvider {
  readonly name = "none";
  async send(): Promise<DeliveryResult> {
    return { status: "skipped", provider: this.name, error: "Email provider not configured", permanent: true };
  }
}

/** Resend HTTP API (no SDK, no extra dependency). */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  async send(message: EmailMessage): Promise<DeliveryResult> {
    try {
      const res = await fetchWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${serverEnv.resendApiKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: serverEnv.emailFrom(),
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string };
      if (res.ok) return { status: "sent", provider: this.name, messageId: body.id };
      return {
        status: "failed",
        provider: this.name,
        error: `Email rejected (${body.name ?? res.status})`,
        permanent: res.status === 422 || res.status === 403,
      };
    } catch {
      return { status: "failed", provider: this.name, error: "Email provider unreachable" };
    }
  }
}

export function getEmailProvider(): EmailProvider {
  if (isDemoMode()) return new SimulatedEmailProvider();
  if (serverEnv.resendApiKey()) return new ResendEmailProvider();
  return new UnconfiguredEmailProvider();
}
