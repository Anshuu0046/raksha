"use client";

import { CheckCircle2, History } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useEmergency } from "./emergency-provider";
import { EmergencyScreen } from "./emergency-screen";

function EndedScreen() {
  const { t, formatTime } = useI18n();
  const em = useEmergency();
  const local = em.local!;
  const safe = local.endReason === "safe";
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const minutes = local.endedAt ? Math.max(1, Math.round((new Date(local.endedAt).getTime() - new Date(local.startedAt).getTime()) / 60_000)) : null;
  const pending = local.neverSent === undefined && em.queued > 0;
  const message = pending
    ? t("ended.syncing")
    : local.neverSent
      ? t("ended.neverSent")
      : safe
        ? t("ended.contactsToldSafe")
        : t("ended.contactsToldMistake");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ended-heading"
      className={cn("fixed inset-0 z-40 flex flex-col text-white", safe ? "bg-safe-ink" : "bg-navy-900")}
    >
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-10">
        <CheckCircle2 className="size-16" strokeWidth={1.75} aria-hidden />
        <h1 ref={ref} id="ended-heading" tabIndex={-1} className="mt-6 text-[40px] font-extrabold leading-[1.02] tracking-[-0.03em] outline-none">
          {safe ? t("ended.safeTitle") : t("ended.cancelledTitle")}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-white/90" aria-live="polite">
          {message}
        </p>
        <dl className="tabular mt-8 grid grid-cols-2 gap-4 border-t border-white/20 pt-5 text-sm">
          <div>
            <dt className="text-white/75">{t("ended.started")}</dt>
            <dd className="text-base font-bold">{formatTime(local.startedAt)}</dd>
          </div>
          <div>
            <dt className="text-white/75">{t("ended.duration")}</dt>
            <dd className="text-base font-bold">{minutes ? t("ended.minutes", { count: minutes }) : "—"}</dd>
          </div>
        </dl>
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Button size="xl" variant="onDarkSolid" block onClick={em.dismiss}>
          {t("ended.backHome")}
        </Button>
        <Button asChild size="lg" variant="onDark" block>
          <Link href="/app/history" onClick={em.dismiss}>
            <History aria-hidden />
            {t("ended.viewHistory")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Renders the full-screen emergency takeover above any route while an emergency is open. */
export function EmergencyLayer() {
  const { phase } = useEmergency();
  if (phase === "idle") return null;
  if (phase === "ended") return <EndedScreen />;
  return <EmergencyScreen />;
}
