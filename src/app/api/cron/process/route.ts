import { ApiError } from "@/lib/api/errors";
import { errorResponse, json } from "@/lib/api/route";
import { isProduction, serverEnv } from "@/lib/env";
import { processDue } from "@/lib/scheduler";
import { safeEqual } from "@/lib/security/tokens";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Scheduler tick. Vercel Cron calls this every minute with `Authorization: Bearer $CRON_SECRET`.
 * Any external scheduler (Supabase pg_cron + pg_net, GitHub Actions, cron-job.org) can do the same.
 */
export async function GET(req: Request) {
  const secret = serverEnv.cronSecret();
  const header = req.headers.get("authorization") ?? "";
  const authorized = secret ? safeEqual(header, `Bearer ${secret}`) : !isProduction();
  if (!authorized) return errorResponse(new ApiError("UNAUTHENTICATED", "Invalid cron credentials."));
  try {
    return json(await processDue());
  } catch (err) {
    console.error("[raksha] cron tick failed:", err);
    return errorResponse(new ApiError("INTERNAL_ERROR", "Scheduler tick failed."));
  }
}
