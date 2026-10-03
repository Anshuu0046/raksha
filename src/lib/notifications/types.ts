export type DeliveryStatus = "sent" | "simulated" | "failed" | "skipped";

export interface DeliveryResult {
  status: DeliveryStatus;
  provider: string;
  messageId?: string;
  /** Sanitised, user-safe reason. Never includes credentials or raw provider payloads. */
  error?: string;
  /** Do not retry (invalid number, unsubscribed endpoint, provider not configured). */
  permanent?: boolean;
}

export interface SmsMessage {
  to: string;
  body: string;
  /** Lets template-based providers (MSG91 DLT) pick the registered template. */
  template: "sos" | "otp" | "generic";
  vars: Record<string, string>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** Emergency alerts stay on screen until the contact acts. */
  urgent: boolean;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<DeliveryResult>;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<DeliveryResult>;
}

export interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushProvider {
  readonly name: string;
  send(target: PushTarget, message: PushMessage): Promise<DeliveryResult & { gone?: boolean }>;
}
