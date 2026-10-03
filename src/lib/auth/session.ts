import { getRepository } from "@/lib/db";
import { isProduction } from "@/lib/env";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { readCookie, userAgent } from "@/lib/server/request";
import type { ClientKind, PublicUser, Session, User } from "@/types";

export const SESSION_COOKIE = "raksha_session";
/** Sliding lifetime. Long on purpose: being signed out at the moment of an emergency is unacceptable. */
export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 12 * 60 * 60 * 1000;

export interface AuthContext {
  user: User;
  session: Session;
  /** How the token arrived; bearer requests are exempt from CSRF origin checks. */
  via: "cookie" | "bearer";
  /** Set when the sliding expiry was extended and the cookie should be re-issued. */
  refreshedToken?: string;
}

export async function createSession(user: User, client: ClientKind, req: Request) {
  const token = generateToken();
  const now = Date.now();
  const session = await getRepository().createSession({
    userId: user.id,
    tokenHash: hashToken(token),
    client,
    userAgent: userAgent(req),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    revokedAt: null,
  });
  return { token, session };
}

export function sessionCookieHeader(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction() ? "; Secure" : ""}`;
}

function extractToken(req: Request): { token: string; via: "cookie" | "bearer" } | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return { token, via: "bearer" };
  }
  const cookie = readCookie(req, SESSION_COOKIE);
  return cookie ? { token: cookie, via: "cookie" } : null;
}

export async function resolveSessionToken(token: string): Promise<{ user: User; session: Session } | null> {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) return null;
  const repo = getRepository();
  const session = await repo.getSessionByTokenHash(hashToken(token));
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() < Date.now()) return null;
  const user = await repo.getUserById(session.userId);
  if (!user) return null;
  return { user, session };
}

export async function authenticate(req: Request): Promise<AuthContext | null> {
  const extracted = extractToken(req);
  if (!extracted) return null;
  const resolved = await resolveSessionToken(extracted.token);
  if (!resolved) return null;
  const ctx: AuthContext = { ...resolved, via: extracted.via };
  const now = Date.now();
  if (now - new Date(resolved.session.lastSeenAt).getTime() > TOUCH_INTERVAL_MS) {
    const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
    await getRepository().touchSession(resolved.session.id, new Date(now).toISOString(), expiresAt);
    if (extracted.via === "cookie") ctx.refreshedToken = extracted.token;
  }
  return ctx;
}

export function toPublicUser(user: User): PublicUser {
  const { passwordHash, googleSub, ...rest } = user;
  return { ...rest, hasPassword: Boolean(passwordHash), googleLinked: Boolean(googleSub) };
}
