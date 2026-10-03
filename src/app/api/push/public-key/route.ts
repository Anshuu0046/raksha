import { route } from "@/lib/api/route";
import { isDemoMode, serverEnv } from "@/lib/env";

/** The VAPID public key is public by design; clients need it to subscribe. */
export const GET = route({ auth: "none" }, async () => ({
  publicKey: serverEnv.vapidPublicKey() || null,
  configured: Boolean(serverEnv.vapidPublicKey() && serverEnv.vapidPrivateKey()),
  demoMode: isDemoMode(),
}));
