"use client";

import { Check, MapPin, Navigation, Phone, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createHoldTracker } from "@/lib/emergency/gestures";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const HOLD_MS = 2000;
const R = 46;
const C = 2 * Math.PI * R;

function Phone_({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <figure className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative w-[230px] rounded-[38px] bg-navy-950 p-[9px] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.6)] ring-1 ring-white/10 sm:w-[250px]">
        <div className="relative h-[460px] overflow-hidden rounded-[30px] sm:h-[500px]">{children}</div>
        <span className="absolute left-1/2 top-[15px] h-[18px] w-[74px] -translate-x-1/2 rounded-full bg-navy-950" aria-hidden />
      </div>
      <figcaption className="text-sm font-semibold text-navy-300">{label}</figcaption>
    </figure>
  );
}

/**
 * The mechanism, dramatized: hold SOS on one phone and watch the alert reach another.
 * Pure simulation (no network calls); labelled as such for visitors.
 */
export function LandingDemo() {
  const t = useT();
  const hold = useMemo(() => createHoldTracker(HOLD_MS), []);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "active">("idle");
  const [step, setStep] = useState(0);
  const frame = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => () => {
    clearTimers();
    if (frame.current) cancelAnimationFrame(frame.current);
  }, []);

  const loop = () => {
    setProgress(hold.progress());
    if (hold.isComplete()) {
      hold.cancel();
      setProgress(1);
      setPhase("active");
      setStep(0);
      [450, 900, 1350, 1900].forEach((ms, i) => timers.current.push(setTimeout(() => setStep(i + 1), ms)));
      return;
    }
    frame.current = requestAnimationFrame(loop);
  };
  const start = () => {
    if (phase !== "idle") return;
    hold.start();
    frame.current = requestAnimationFrame(loop);
  };
  const stop = () => {
    if (!hold.active) return;
    hold.cancel();
    if (frame.current) cancelAnimationFrame(frame.current);
    setProgress(0);
  };
  const reset = () => {
    clearTimers();
    setPhase("idle");
    setStep(0);
    setProgress(0);
  };

  const checks = [t("landing.demo.check1"), t("landing.demo.check2"), t("landing.demo.check3")];

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-end justify-center gap-4 sm:gap-8">
        <Phone_ label={t("landing.demo.herPhone")}>
          {phase === "idle" ? (
            <div className="flex h-full flex-col bg-navy-900 px-4 pb-5 pt-10 text-white">
              <p className="flex items-center gap-2 text-[13px] font-bold">
                <span className="size-2 rounded-full bg-safe-bright" aria-hidden />
                {t("home.protected")}
              </p>
              <p className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-white/8 px-2 py-1 text-[11px] text-navy-200">
                <MapPin className="size-3" aria-hidden />
                {t("home.locationAvailable")}
              </p>
              <div className="flex flex-1 items-center justify-center">
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    start();
                  }}
                  onPointerUp={stop}
                  onPointerCancel={stop}
                  onKeyDown={(e) => {
                    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                      e.preventDefault();
                      start();
                    }
                  }}
                  onKeyUp={stop}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label={t("landing.demo.tryAria")}
                  className="on-dark relative grid size-36 touch-none select-none place-items-center rounded-full bg-sos text-white shadow-[0_14px_30px_-10px_rgb(217_31_44/0.7)] [-webkit-touch-callout:none]"
                >
                  <svg viewBox="0 0 100 100" className="pointer-events-none absolute -inset-2.5 size-[calc(100%+20px)] -rotate-90" aria-hidden>
                    <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(255 255 255 / .14)" strokeWidth="2.5" />
                    <circle cx="50" cy="50" r={R} fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
                  </svg>
                  <span className="text-[40px] font-extrabold tracking-[-0.04em]">SOS</span>
                </button>
              </div>
              <p className="text-center text-[12px] font-semibold">{t("sos.holdHint")}</p>
            </div>
          ) : (
            <div className="flex h-full flex-col bg-sos-deep px-4 pb-5 pt-10 text-white">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-sos-tint">
                <span className="size-1.5 animate-beacon rounded-full bg-white" aria-hidden />
                {t("landing.demo.simulation")}
              </p>
              <p className="mt-2 text-[30px] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]">{t("emergency.active")}</p>
              <ul className="mt-5 flex flex-col gap-2.5">
                {checks.map((c, i) => (
                  <li key={c} className={cn("flex items-center gap-2 text-[13px] font-bold transition-opacity duration-300", step > i ? "opacity-100" : "opacity-30")}>
                    <span className={cn("grid size-5 place-items-center rounded-full", step > i ? "bg-white text-sos-deep" : "bg-white/15")}>
                      <Check className="size-3" strokeWidth={3.5} aria-hidden />
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
              <div className="mt-auto grid grid-cols-2 gap-1.5 text-[10px] font-extrabold uppercase">
                <span className="grid h-10 place-items-center rounded-lg bg-white text-sos-deep">{t("emergency.callPolice")}</span>
                <span className="grid h-10 place-items-center rounded-lg bg-white text-sos-deep">{t("emergency.callAmbulance")}</span>
                <span className="grid h-10 place-items-center rounded-lg bg-navy-950">{t("emergency.shareLocation")}</span>
                <span className="grid h-10 place-items-center rounded-lg ring-1 ring-inset ring-white/40">{t("emergency.cancelAction")}</span>
              </div>
            </div>
          )}
        </Phone_>

        <Phone_ label={t("landing.demo.momPhone")} className="hidden sm:flex">
          <div className="flex h-full flex-col bg-[#1b2633] px-3 pb-5 pt-12 text-white">
            <p className="tabular text-center text-[44px] font-semibold leading-none tracking-[-0.02em]">22:42</p>
            <p className="mt-1 text-center text-[12px] text-navy-300">{t("landing.demo.lockDate")}</p>
            <div
              className={cn(
                "mt-6 rounded-2xl bg-white p-3 text-ink shadow-lg transition-all duration-500 ease-[var(--ease-out-expo)]",
                step >= 2 ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0",
              )}
              aria-hidden={step < 2}
            >
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-sos-ink">
                <span className="size-1.5 rounded-full bg-sos" aria-hidden />
                Raksha · {t("landing.demo.now")}
              </p>
              <p className="mt-1 text-[14px] font-extrabold leading-tight">{t("notify.sos.pushTitle", { name: "Ananya" })}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{t("notify.sos.pushBody", { name: "Ananya" })}</p>
            </div>
            <div className={cn("mt-3 flex flex-col gap-1.5 transition-opacity duration-500", step >= 4 ? "opacity-100" : "opacity-0")} aria-hidden={step < 4}>
              <span className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-sos text-[12px] font-bold">
                <Phone className="size-3.5" aria-hidden />
                {t("portal.call", { name: "Ananya" })}
              </span>
              <span className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/12 text-[12px] font-bold">
                <Navigation className="size-3.5" aria-hidden />
                {t("portal.directions")}
              </span>
            </div>
          </div>
        </Phone_>
      </div>
      <div className="mt-5 flex min-h-11 items-center gap-3 text-sm text-navy-300" aria-live="polite">
        {phase === "active" ? (
          <button type="button" onClick={reset} className="on-dark inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 font-semibold text-white hover:bg-white/16">
            <RotateCcw className="size-4" aria-hidden />
            {t("landing.demo.reset")}
          </button>
        ) : (
          <p>{t("landing.demo.hint")}</p>
        )}
      </div>
    </div>
  );
}
