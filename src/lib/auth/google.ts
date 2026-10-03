import { createHash } from "node:crypto";
import { appUrl, isProduction, serverEnv } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/maps/cache";
import { generateToken } from "@/lib/security/tokens";

export const GOOGLE_STATE_COOKIE = "raksha_oauth";

function redirectUri() {
  return `${appUrl()}/api/auth/google/callback`;
}

/** Authorization Code + PKCE. State and verifier travel in a short-lived httpOnly cookie. */
export function googleAuthStart(): { url: string; cookie: string } {
  const state = generateToken(16);
  const verifier = generateToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: serverEnv.googleClientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const cookie = [
    `${GOOGLE_STATE_COOKIE}=${state}.${verifier}`,
    "Path=/api/auth/google",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
    isProduction() ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, cookie };
}

export async function googleExchange(code: string, verifier: string) {
  const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: serverEnv.googleClientId(),
      client_secret: serverEnv.googleClientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) throw new Error("Google token exchange failed");
  const tokens = (await tokenRes.json()) as { access_token: string };
  const infoRes = await fetchWithTimeout("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) throw new Error("Google userinfo failed");
  const info = (await infoRes.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  return {
    sub: info.sub,
    email: info.email?.toLowerCase() ?? null,
    emailVerified: Boolean(info.email_verified),
    name: info.name ?? info.email?.split("@")[0] ?? "",
    picture: info.picture ?? null,
  };
}
