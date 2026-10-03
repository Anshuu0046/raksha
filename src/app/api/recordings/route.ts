import { ApiError } from "@/lib/api/errors";
import { json, route } from "@/lib/api/route";
import { getRepository } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { newId } from "@/lib/security/tokens";
import { getRecordingStore } from "@/lib/storage/recordings";

export const maxDuration = 60;

// Vercel request bodies are capped at 4.5 MB; the recorder rotates segments to stay below this.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac"];

export const GET = route({ auth: "user" }, async ({ auth }) => {
  const recordings = await getRepository().listRecordings(auth.user.id);
  return { recordings: recordings.map(({ storageKey: _k, ...r }) => r) };
});

/** Multipart upload: file, eventId?, durationSeconds. Stored privately, keyed by random id. */
export const POST = route({ auth: "user", rateLimit: RATE_LIMITS.upload }, async ({ req, auth }) => {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_BYTES + 64 * 1024) throw new ApiError("PAYLOAD_TOO_LARGE", "Recording segment is too large.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Expected a multipart upload.");
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) throw new ApiError("VALIDATION_ERROR", "No audio file was attached.");
  if (file.size > MAX_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", "Recording segment is too large.");
  const mimeType = (file.type || "audio/webm").split(";")[0]!.trim();
  if (!ALLOWED.includes(mimeType)) throw new ApiError("VALIDATION_ERROR", "Unsupported audio format.");

  const repo = getRepository();
  const eventIdRaw = form.get("eventId");
  const eventId = typeof eventIdRaw === "string" && eventIdRaw ? eventIdRaw : null;
  if (eventId && !(await repo.getEmergency(auth.user.id, eventId))) {
    throw new ApiError("EMERGENCY_NOT_FOUND", "This emergency could not be found.");
  }
  const duration = Math.max(0, Math.min(3600, Number(form.get("durationSeconds") || 0) || 0));

  // Storage key is random and namespaced per user; it is never returned to clients.
  const storageKey = `${auth.user.id}/${newId()}.${mimeType.split("/")[1]}`;
  await getRecordingStore().put(storageKey, new Uint8Array(await file.arrayBuffer()), mimeType);
  const recording = await repo.createRecording({
    userId: auth.user.id,
    eventId,
    storageKey,
    mimeType,
    sizeBytes: file.size,
    durationSeconds: duration,
  });
  await audit({ userId: auth.user.id, actor: "user", action: "recording.uploaded", targetType: "recording", targetId: recording.id, metadata: { bytes: file.size } });
  const { storageKey: _k, ...view } = recording;
  return json({ recording: view }, { status: 201 });
});
