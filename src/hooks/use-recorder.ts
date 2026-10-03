"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recordingsDb } from "@/lib/offline/recordings-db";

export type RecorderStatus = "idle" | "requesting" | "recording" | "saving" | "denied" | "unsupported" | "error";

// Rotate segments so each upload stays under the serverless body limit and each file plays alone.
const SEGMENT_MS = 10 * 60_000;
const BITRATE = 24_000;

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

export interface RecorderSegment {
  id: string;
  durationSeconds: number;
  size: number;
  mimeType: string;
  blob: Blob;
}

/**
 * Emergency audio recorder. Honest by construction: the status is "unsupported" or "denied"
 * when the browser cannot record; it never shows a running timer without a live MediaRecorder.
 */
export function useRecorder(options: { eventId: string | null; onSegment?: (segment: RecorderSegment) => void }) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [segments, setSegments] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);
  const segmentStartedAt = useRef(0);
  const rotateTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const supported = typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  const startSegment = useCallback(() => {
    if (!stream.current) return;
    const mimeType = pickMime();
    const rec = new MediaRecorder(stream.current, { mimeType, audioBitsPerSecond: BITRATE });
    const chunks: Blob[] = [];
    segmentStartedAt.current = Date.now();
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" });
      if (blob.size === 0) return;
      const segment: RecorderSegment = {
        id: crypto.randomUUID(),
        durationSeconds: Math.round((Date.now() - segmentStartedAt.current) / 1000),
        size: blob.size,
        mimeType: blob.type.split(";")[0] || "audio/webm",
        blob,
      };
      try {
        await recordingsDb.put({
          id: segment.id,
          eventId: optsRef.current.eventId,
          createdAt: new Date().toISOString(),
          durationSeconds: segment.durationSeconds,
          mimeType: segment.mimeType,
          size: segment.size,
          blob,
          uploaded: false,
        });
      } catch {
        // IndexedDB unavailable (private mode): the segment is still handed to onSegment.
      }
      setSegments((n) => n + 1);
      optsRef.current.onSegment?.(segment);
    };
    rec.start(5000);
    recorder.current = rec;
  }, []);

  const stop = useCallback(() => {
    if (rotateTimer.current) clearInterval(rotateTimer.current);
    if (tick.current) clearInterval(tick.current);
    if (recorder.current && recorder.current.state !== "inactive") {
      setStatus("saving");
      recorder.current.stop();
    }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
    setTimeout(() => setStatus((s) => (s === "saving" ? "idle" : s)), 400);
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      setStatus("unsupported");
      return false;
    }
    setStatus("requesting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setStatus((err as DOMException)?.name === "NotAllowedError" ? "denied" : "error");
      return false;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    startSegment();
    setStatus("recording");
    tick.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    rotateTimer.current = setInterval(() => {
      // Close the current file and immediately start a new one on the same stream.
      if (recorder.current?.state === "recording") {
        recorder.current.stop();
        startSegment();
      }
    }, SEGMENT_MS);
    return true;
  }, [startSegment, supported]);

  useEffect(() => () => stop(), [stop]);

  return { status, elapsed, segments, supported, start, stop };
}
