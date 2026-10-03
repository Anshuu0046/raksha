import { upsertGoogleUser } from "@/lib/auth/accounts";
import { GOOGLE_STATE_COOKIE, googleExchange } from "@/lib/auth/google";
import { createSession, sessionCookieHeader } from "@/lib/auth/session";
import { appUrl } from "@/lib/env";
import { safeEqual } from "@/lib/security/tokens";
import { readCookie } from "@/lib/server/request";

function fail(reason: string) {
  return new Response(null, { status: 302, headers: { Location: `${appUrl()}/login?error=${reason}`, "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const [expectedState, verifier] = (readCookie(req, GOOGLE_STATE_COOKIE) ?? "").split(".");
  if (!code || !state || !expectedState || !verifier || !safeEqual(state, expectedState)) return fail("google_state");
  try {
    const profile = await googleExchange(code, verifier);
    const user = await upsertGoogleUser(profile);
    const { token } = await createSession(user, "web", req);
    const headers = new Headers({ Location: `${appUrl()}${user.onboardedAt ? "/app" : "/onboarding"}`, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", sessionCookieHeader(token));
    headers.append("Set-Cookie", `${GOOGLE_STATE_COOKIE}=; Path=/api/auth/google; Max-Age=0; HttpOnly; SameSite=Lax`);
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.error("[raksha] google login failed:", err instanceof Error ? err.message : err);
    return fail("google_failed");
  }
}
