import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { getRecordingStore } from "@/lib/storage/recordings";

type Params = { id: string };

/** Owner-only download, streamed through the API so storage URLs are never exposed. */
export const GET = route<Params>({ auth: "user" }, async ({ auth, params }) => {
  const recording = await getRepository().getRecording(auth.user.id, z.string().uuid().parse(params.id));
  if (!recording) throw new ApiError("NOT_FOUND", "Recording not found.");
  const object = await getRecordingStore().get(recording.storageKey);
  if (!object) throw new ApiError("NOT_FOUND", "Recording file is no longer available.");
  const ext = recording.mimeType.split("/")[1] ?? "webm";
  return new Response(Buffer.from(object.bytes), {
    headers: {
      "Content-Type": recording.mimeType,
      "Content-Disposition": `attachment; filename="raksha-recording-${recording.createdAt.slice(0, 10)}.${ext}"`,
      "Cache-Control": "private, no-store",
    },
  });
});

/** Secure deletion: removes the stored object and the row. */
export const DELETE = route<Params>({ auth: "user", rateLimit: RATE_LIMITS.write }, async ({ auth, params }) => {
  const recording = await getRepository().deleteRecording(auth.user.id, z.string().uuid().parse(params.id));
  if (!recording) throw new ApiError("NOT_FOUND", "Recording not found.");
  await getRecordingStore().delete(recording.storageKey).catch(() => undefined);
  await audit({ userId: auth.user.id, actor: "user", action: "recording.deleted", targetType: "recording", targetId: recording.id });
  return { deleted: true };
});
