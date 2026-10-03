import { json } from "@/lib/api/route";
import type { ClientKind, User } from "@/types";
import { createSession, sessionCookieHeader, toPublicUser } from "./session";

/**
 * Issues a session. Web clients get an httpOnly cookie (the token never touches JS);
 * Android clients get the bearer token in the body to keep in EncryptedSharedPreferences.
 */
export async function respondWithSession(user: User, client: ClientKind, req: Request, extra: Record<string, unknown> = {}) {
  const { token, session } = await createSession(user, client, req);
  const body = { user: toPublicUser(user), ...extra, ...(client === "android" ? { token, expiresAt: session.expiresAt } : {}) };
  return json(body, { headers: client === "web" ? { "Set-Cookie": sessionCookieHeader(token) } : {} });
}
