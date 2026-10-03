import { route } from "@/lib/api/route";
import { googleLoginEnabled, otpAvailable } from "@/lib/auth/accounts";
import { isDemoMode } from "@/lib/env";

/** Lets clients (web + Android) show only the sign-in methods that actually work. */
export const GET = route({ auth: "none" }, async () => ({
  password: true,
  phoneOtp: otpAvailable(),
  google: googleLoginEnabled(),
  demoMode: isDemoMode(),
}));
