"use client";

import { ChevronRight, Navigation } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/misc";
import { useApi } from "@/hooks/use-api";
import { useI18n } from "@/lib/i18n/client";
import type { SafeJourney } from "@/types";

/** Shows the active Safe Journey on the home screen, or nothing (the nav covers starting one). */
export function JourneyShortcut() {
  const { t, formatTime } = useI18n();
  const { data } = useApi<{ journey: SafeJourney | null }>("/api/journey", { refreshMs: 60_000 });
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  const journey = data?.journey;
  if (!journey) return null;
  const late = now > 0 && new Date(journey.expectedArrivalAt).getTime() < now;
  return (
    <Panel className={late ? "ring-2 ring-warn" : undefined}>
      <Link href="/app/journey" className="flex min-h-20 items-center gap-3 p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-navy-900 text-white">
          <Navigation className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{t("journey.activeTo", { destination: journey.destinationLabel })}</span>
          <span className={late ? "block text-sm font-semibold text-warn" : "block text-sm text-ink-3"}>
            {late ? t("journey.lateShort") : t("journey.eta", { time: formatTime(journey.expectedArrivalAt) })}
          </span>
        </span>
        <ChevronRight className="size-5 text-ink-3" aria-hidden />
      </Link>
    </Panel>
  );
}
