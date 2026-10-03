import { json, route } from "@/lib/api/route";
import { clearSessionCookieHeader } from "@/lib/auth/session";
import { getRepository } from "@/lib/db";
import { audit } from "@/lib/security/audit";

export const POST = route({ auth: "optional" }, async ({ auth, ipHash }) => {
  if (auth) {
    await getRepository().revokeSession(auth.session.id);
    await audit({ userId: auth.user.id, actor: "user", action: "auth.logout", ipHash });
  }
  return json({ signedOut: true }, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
});
