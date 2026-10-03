import { getRepository } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Reveals nothing beyond up/down. */
export async function GET() {
  let db = false;
  try {
    db = await getRepository().ping();
  } catch {
    db = false;
  }
  return Response.json({ ok: db, time: new Date().toISOString() }, { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
