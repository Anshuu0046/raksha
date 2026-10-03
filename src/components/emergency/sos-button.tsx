"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createHoldTracker, createTapDetector } from "@/lib/emergency/gestures";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { TriggerMethod } from "@/types";
import { unlockSiren } from "@/lib/emergency/siren";

const RING_R = 47;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The SOS control. Press-and-hold (default 2 s) or three quick taps. A white ring fills around
 * the disc while held; releasing early cancels with no side effects. Keyboard: hold Space/Enter.
 */
export function SosButton({
  holdMs,
  tripleTapEnabled,
  onTrigger,
  disabled,
  className,
}: {
  holdMs: number;
  tripleTapEnabled: boolean;
  onTrigger: (method: TriggerMethod) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useT();
  const hold = useMemo(() => createHoldTracker(holdMs), [holdMs]);
  const taps = useMemo(() => createTapDetector({ count: 3, windowMs: 1200 }), []);
  const [progress, setProgress] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [announce, setAnnounce] = useState("");
  const frame = useRef<number | null>(null);
  const pressStart = useRef(0);
  const method = useRef<TriggerMethod>("hold");
  const fired = useRef(false);
  const tapReset = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopLoop = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const fire = useCallback(
    (m: TriggerMethod) => {
      if (fired.current) return;
      fired.current = true;
      stopLoop();
      setProgress(1);
      onTrigger(m);
    },
    [onTrigger],
  );

  // The rAF loop re-schedules itself through a ref so it always runs the latest closure.
  const loopRef = useRef<() => void>(() => undefined);
  const loop = useCallback(() => {
    const p = hold.progress();
    setProgress(p);
    if (hold.isComplete()) {
      hold.cancel();
      fire(method.current);
      return;
    }
    frame.current = requestAnimationFrame(() => loopRef.current());
  }, [fire, hold]);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  const begin = (m: TriggerMethod) => {
    if (disabled || hold.active) return;
    fired.current = false;
    method.current = m;
    pressStart.current = Date.now();
    hold.start();
    try {
      navigator.vibrate?.(25);
    } catch {
      // unsupported
    }
    setAnnounce(t("sos.keepHolding"));
    frame.current = requestAnimationFrame(loop);
  };

  const end = (countTap: boolean) => {
    if (!hold.active) return;
    const short = Date.now() - pressStart.current < 350;
    hold.cancel();
    stopLoop();
    setProgress(0);
    setAnnounce("");
    if (countTap && short && tripleTapEnabled && !fired.current) {
      const done = taps.tap();
      setTapCount(done ? 0 : taps.pending);
      if (tapReset.current) clearTimeout(tapReset.current);
      tapReset.current = setTimeout(() => {
        taps.reset();
        setTapCount(0);
      }, 1300);
      if (done) fire("triple_tap");
    }
  };

  useEffect(() => () => {
    stopLoop();
    if (tapReset.current) clearTimeout(tapReset.current);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil(((1 - progress) * holdMs) / 1000));
  const holding = progress > 0 && progress < 1;

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={t("sos.ariaLabel", { seconds: Math.round(holdMs / 1000) })}
        aria-describedby="sos-hints"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          unlockSiren();
          begin("hold");
        }}
        onPointerUp={() => end(true)}
        onPointerCancel={() => end(false)}
        onLostPointerCapture={() => end(false)}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            unlockSiren();
            begin("keyboard");
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            end(false);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "on-dark group relative grid sos-disc aspect-square touch-none select-none place-items-center rounded-full bg-sos text-white",
          "shadow-[0_18px_50px_-12px_rgb(217_31_44/0.55),inset_0_-6px_0_rgb(0_0_0/0.12)] transition-transform duration-200 ease-[var(--ease-out-expo)]",
          "[-webkit-touch-callout:none] active:scale-[0.97] disabled:opacity-60",
          holding && "scale-[0.97]",
        )}
      >
        {/* Hold ring: white arc fills around the disc */}
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute -inset-[14px] size-[calc(100%+28px)] -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={RING_R} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth="2.4" />
          <circle
            cx="50"
            cy="50"
            r={RING_R}
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - progress)}
          />
        </svg>
        <span className="pointer-events-none flex flex-col items-center">
          <span className="sos-label font-extrabold leading-none tracking-[-0.04em]">SOS</span>
          <span className="tabular mt-2 h-5 text-sm font-semibold text-sos-tint">
            {holding ? t("sos.holdCountdown", { seconds: secondsLeft }) : tapCount > 0 ? t("sos.tapCount", { count: tapCount }) : ""}
          </span>
        </span>
      </button>
      <div id="sos-hints" className="mt-7 text-center">
        <p className="text-[17px] font-semibold text-white">{t("sos.holdHint")}</p>
        {tripleTapEnabled ? <p className="mt-1 text-[15px] text-navy-300">{t("sos.tapHint")}</p> : null}
      </div>
      <p className="sr-only" aria-live="assertive">
        {announce}
      </p>
    </div>
  );
}
