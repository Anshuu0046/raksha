"use client";

/**
 * Device-local store for emergency audio. Every segment is written here first, so a recording
 * survives a dropped network or a closed tab. Upload is a separate, optional step.
 */
export interface LocalRecording {
  id: string;
  eventId: string | null;
  createdAt: string;
  durationSeconds: number;
  mimeType: string;
  size: number;
  blob: Blob;
  uploaded: boolean;
}

const DB_NAME = "raksha";
const STORE = "recordings";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export const recordingsDb = {
  put: (rec: LocalRecording) => tx("readwrite", (s) => s.put(rec)),
  list: () => tx<LocalRecording[]>("readonly", (s) => s.getAll() as IDBRequest<LocalRecording[]>),
  remove: (id: string) => tx("readwrite", (s) => s.delete(id)),
  markUploaded: async (id: string) => {
    const all = await recordingsDb.list();
    const rec = all.find((r) => r.id === id);
    if (rec) await recordingsDb.put({ ...rec, uploaded: true });
  },
};
