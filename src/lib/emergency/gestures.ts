/**
 * Pure gesture logic for SOS activation, separated from React so it is unit-testable.
 */

/** Detects N taps within a time window (default: 3 taps within 1.2 s). */
export function createTapDetector(options: { count?: number; windowMs?: number } = {}) {
  const count = options.count ?? 3;
  const windowMs = options.windowMs ?? 1200;
  let taps: number[] = [];
  return {
    /** Records a tap; returns true when this tap completes the pattern. */
    tap(at: number = Date.now()): boolean {
      taps = taps.filter((t) => at - t <= windowMs);
      taps.push(at);
      if (taps.length >= count) {
        taps = [];
        return true;
      }
      return false;
    },
    reset() {
      taps = [];
    },
    get pending() {
      return taps.length;
    },
  };
}

/**
 * Hold-to-activate state machine. A hold completes only if the press lasts `durationMs`
 * without release; releasing early cancels. Short presses do not count toward anything here.
 */
export function createHoldTracker(durationMs: number) {
  let startedAt: number | null = null;
  return {
    start(at: number = Date.now()) {
      startedAt = at;
    },
    /** Progress 0..1 for the ring animation. */
    progress(at: number = Date.now()): number {
      if (startedAt === null) return 0;
      return Math.min(1, (at - startedAt) / durationMs);
    },
    isComplete(at: number = Date.now()): boolean {
      return startedAt !== null && at - startedAt >= durationMs;
    },
    cancel() {
      startedAt = null;
    },
    get active() {
      return startedAt !== null;
    },
  };
}
