import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/lib/env";

/** 256-bit URL-safe random token. Used for sessions, share links, invite links. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are stored only as SHA-256 hashes, so a database leak does not leak live links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Keyed hash for low-entropy secrets (OTP codes) and for pseudonymising IPs in audit logs. */
export function hmac(value: string, purpose: string): string {
  return createHmac("sha256", authSecret()).update(`${purpose}:${value}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function newId(): string {
  return randomUUID();
}

/** Shape check for incoming share tokens (43 chars of base64url for 32 bytes). */
export function looksLikeToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(token);
}
