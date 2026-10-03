import { googleLoginEnabled } from "@/lib/auth/accounts";
import { googleAuthStart } from "@/lib/auth/google";
import { appUrl } from "@/lib/env";

export async function GET() {
  if (!googleLoginEnabled()) return Response.redirect(`${appUrl()}/login?error=google_unavailable`, 302);
  const { url, cookie } = googleAuthStart();
  return new Response(null, { status: 302, headers: { Location: url, "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}
