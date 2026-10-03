import { isDemoMode, serverEnv } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/maps/cache";
import type { DeliveryResult, SmsMessage, SmsProvider } from "../types";

/** Demo/dev provider: logs a redacted line and reports "simulated". Never sends anything. */
export class SimulatedSmsProvider implements SmsProvider {
  readonly name = "simulated-sms";
  async send(message: SmsMessage): Promise<DeliveryResult> {
    console.info(`[raksha][demo] SMS to …${message.to.slice(-4)}: ${message.body}`);
    return { status: "simulated", provider: this.name };
  }
}

class UnconfiguredSmsProvider implements SmsProvider {
  readonly name = "none";
  async send(): Promise<DeliveryResult> {
    return { status: "skipped", provider: this.name, error: "SMS provider not configured", permanent: true };
  }
}

/** Twilio Programmable Messaging. Supports a Messaging Service SID or a From number. */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";
  async send(message: SmsMessage): Promise<DeliveryResult> {
    const accountSid = serverEnv.twilioSid();
    const apiKeySid = serverEnv.twilioApiKeySid();
    const apiKeySecret = serverEnv.twilioApiKeySecret();
    const authUser = apiKeySid || accountSid;
    const authPass = apiKeySecret || serverEnv.twilioToken();

    const form = new URLSearchParams({ To: message.to, Body: message.body });
    const service = serverEnv.twilioMessagingServiceSid();
    if (service) form.set("MessagingServiceSid", service);
    else form.set("From", serverEnv.twilioFrom());
    try {
      const res = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${authUser}:${authPass}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
      if (res.ok) return { status: "sent", provider: this.name, messageId: body.sid };
      // 4xx (e.g. 21211 invalid number, 21610 unsubscribed) will not succeed on retry.
      const errorDetail = body.message ? `${body.code ? `${body.code}: ` : ""}${body.message}` : `${body.code ?? res.status}`;
      return {
        status: "failed",
        provider: this.name,
        error: `Twilio error (${errorDetail})`,
        permanent: res.status >= 400 && res.status < 500 && res.status !== 429,
      };
    } catch {
      return { status: "failed", provider: this.name, error: "SMS provider unreachable" };
    }
  }
}

/**
 * MSG91 Flow API. Indian SMS requires DLT-registered templates: register one template per
 * kind (see docs/NOTIFICATIONS.md) and set MSG91_*_TEMPLATE_ID. Variables are passed by name.
 */
export class Msg91SmsProvider implements SmsProvider {
  readonly name = "msg91";
  async send(message: SmsMessage): Promise<DeliveryResult> {
    const templateId =
      message.template === "sos"
        ? serverEnv.msg91SosTemplateId()
        : message.template === "otp"
          ? serverEnv.msg91OtpTemplateId()
          : serverEnv.msg91GenericTemplateId();
    if (!templateId) {
      return { status: "skipped", provider: this.name, error: `No MSG91 template for ${message.template}`, permanent: true };
    }
    try {
      const res = await fetchWithTimeout("https://control.msg91.com/api/v5/flow", {
        method: "POST",
        headers: { authkey: serverEnv.msg91AuthKey(), "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          short_url: "0",
          recipients: [{ mobiles: message.to.replace(/^\+/, ""), ...message.vars }],
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string; request_id?: string };
      if (res.ok && body.type !== "error") return { status: "sent", provider: this.name, messageId: body.request_id ?? body.message };
      return { status: "failed", provider: this.name, error: "MSG91 rejected the message", permanent: res.status === 400 };
    } catch {
      return { status: "failed", provider: this.name, error: "SMS provider unreachable" };
    }
  }
}

/**
 * TextBee (textbee.dev, open source): sends through the SIM card of an Android phone you own, so no DLT
 * registration is needed. The phone must stay on, online and exempt from battery optimisation.
 * Suitable for a pilot or as a backup channel, not as the only channel for a public launch.
 */
export class TextBeeSmsProvider implements SmsProvider {
  readonly name = "textbee";
  async send(message: SmsMessage): Promise<DeliveryResult> {
    const apiKey = serverEnv.textbeeApiKey();
    const deviceId = serverEnv.textbeeDeviceId();
    if (!apiKey || !deviceId) {
      return { status: "skipped", provider: this.name, error: "TextBee is not configured", permanent: true };
    }
    try {
      const res = await fetchWithTimeout(`https://api.textbee.dev/api/v1/gateway/devices/${encodeURIComponent(deviceId)}/send-sms`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: [message.to], message: message.body }),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: { smsBatchId?: string; _id?: string } };
      if (res.ok) return { status: "sent", provider: this.name, messageId: body.data?.smsBatchId ?? body.data?._id };
      return { status: "failed", provider: this.name, error: `TextBee error (${res.status})`, permanent: res.status >= 400 && res.status < 500 && res.status !== 429 };
    } catch {
      return { status: "failed", provider: this.name, error: "SMS provider unreachable" };
    }
  }
}

export function getSmsProvider(): SmsProvider {
  if (isDemoMode()) return new SimulatedSmsProvider();
  switch (serverEnv.smsProvider()) {
    case "twilio":
      return new TwilioSmsProvider();
    case "msg91":
      return new Msg91SmsProvider();
    case "textbee":
      return new TextBeeSmsProvider();
    case "console":
      return new SimulatedSmsProvider();
    default:
      return new UnconfiguredSmsProvider();
  }
}
