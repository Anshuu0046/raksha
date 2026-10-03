import { ApiError } from "@/lib/api/errors";
import { isDemoMode, isProduction, serverEnv } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/maps/cache";

export interface StoredObject {
  bytes: Uint8Array;
  mimeType: string;
}

export interface RecordingStore {
  readonly name: string;
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

/** Private Supabase Storage bucket, accessed only with the server-side service-role key. */
class SupabaseRecordingStore implements RecordingStore {
  readonly name = "supabase";
  private base() {
    return `${serverEnv.supabaseUrl()}/storage/v1/object/${serverEnv.recordingsBucket()}`;
  }
  private headers(extra: Record<string, string> = {}) {
    const key = serverEnv.supabaseServiceKey();
    return { Authorization: `Bearer ${key}`, apikey: key, ...extra };
  }
  async put(key: string, bytes: Uint8Array, mimeType: string) {
    const res = await fetchWithTimeout(`${this.base()}/${key}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": mimeType, "x-upsert": "false", "Cache-Control": "no-store" }),
      body: Buffer.from(bytes),
    }, 30_000);
    if (!res.ok) throw new ApiError("UPSTREAM_UNAVAILABLE", "Secure storage is unavailable. Your recording is still saved on this device.");
  }
  async get(key: string) {
    const res = await fetchWithTimeout(`${this.base()}/${key}`, { headers: this.headers() }, 30_000);
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new ApiError("UPSTREAM_UNAVAILABLE", "Secure storage is unavailable.");
    return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: res.headers.get("content-type") ?? "audio/webm" };
  }
  async delete(key: string) {
    await fetchWithTimeout(`${this.base()}`, {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: [key] }),
    });
  }
}

/** Development / demo only. Bounded so a long demo cannot exhaust memory. */
class MemoryRecordingStore implements RecordingStore {
  readonly name = "memory";
  private objects = new Map<string, StoredObject>();
  private total = 0;
  async put(key: string, bytes: Uint8Array, mimeType: string) {
    if (this.total + bytes.byteLength > 100 * 1024 * 1024) {
      const [oldest] = this.objects.keys();
      if (oldest) await this.delete(oldest);
    }
    this.objects.set(key, { bytes, mimeType });
    this.total += bytes.byteLength;
  }
  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
  async delete(key: string) {
    const o = this.objects.get(key);
    if (o) this.total -= o.bytes.byteLength;
    this.objects.delete(key);
  }
}

const globalStore = globalThis as unknown as { __rakshaRecordings?: RecordingStore };

export function recordingStorageAvailable(): boolean {
  return Boolean(serverEnv.supabaseUrl() && serverEnv.supabaseServiceKey()) || isDemoMode() || !isProduction();
}

export function getRecordingStore(): RecordingStore {
  if (globalStore.__rakshaRecordings) return globalStore.__rakshaRecordings;
  let store: RecordingStore;
  if (serverEnv.supabaseUrl() && serverEnv.supabaseServiceKey()) store = new SupabaseRecordingStore();
  else if (isDemoMode() || !isProduction()) store = new MemoryRecordingStore();
  else throw new ApiError("PROVIDER_NOT_CONFIGURED", "Cloud backup for recordings is not set up. Recordings stay on your device.");
  globalStore.__rakshaRecordings = store;
  return store;
}
