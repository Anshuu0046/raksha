import { ApiError } from "@/lib/api/errors";
import { getRepository } from "@/lib/db";

export interface RateLimitRule {
  /** Logical bucket name, e.g. "auth:login". */
  name: string;
  limit: number;
  windowMs: number;
}

/** Central catalogue so limits are reviewable in one place. */
export const RATE_LIMITS = {
  login: { name: "auth:login", limit: 10, windowMs: 15 * 60_000 },
  signup: { name: "auth:signup", limit: 5, windowMs: 60 * 60_000 },
  otpRequest: { name: "auth:otp", limit: 3, windowMs: 15 * 60_000 },
  otpVerify: { name: "auth:otp-verify", limit: 10, windowMs: 15 * 60_000 },
  passwordReset: { name: "auth:reset", limit: 5, windowMs: 60 * 60_000 },
  // SOS is deliberately generous: a real emergency must never be blocked, but a runaway
  // client or script cannot spam a user's contacts.
  sosTrigger: { name: "sos:trigger", limit: 12, windowMs: 10 * 60_000 },
  location: { name: "sos:location", limit: 240, windowMs: 10 * 60_000 },
  testNotification: { name: "contacts:test", limit: 5, windowMs: 60 * 60_000 },
  notificationsSend: { name: "notifications:send", limit: 20, windowMs: 60 * 60_000 },
  write: { name: "api:write", limit: 120, windowMs: 60_000 },
  nearby: { name: "maps:nearby", limit: 30, windowMs: 60_000 },
  geocode: { name: "maps:geocode", limit: 30, windowMs: 60_000 },
  publicView: { name: "public:emergency", limit: 120, windowMs: 60_000 },
  publicSubscribe: { name: "public:subscribe", limit: 10, windowMs: 60 * 60_000 },
  upload: { name: "recordings:upload", limit: 20, windowMs: 60 * 60_000 },
} satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window limiter backed by the repository (PostgreSQL in production, so it is shared
 * across serverless instances). Fails open on storage errors: availability of the safety path
 * matters more than strict limiting.
 */
export async function enforceRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  let count: number;
  try {
    count = await getRepository().hitRateLimit(`${rule.name}:${subject}`, rule.windowMs, Date.now());
  } catch (err) {
    console.error("[raksha] rate limiter unavailable, failing open:", err instanceof Error ? err.message : err);
    return;
  }
  if (count > rule.limit) {
    throw new ApiError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.", undefined, {
      "Retry-After": String(Math.ceil(rule.windowMs / 1000)),
    });
  }
}
