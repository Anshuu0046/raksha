"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { CallButton } from "@/components/emergency/call-button";
import { useAppData } from "@/components/providers/app-data-provider";
import { PageHeader, Panel } from "@/components/ui/misc";
import { SUPPORTED_REGIONS } from "@/config/emergencyNumbers";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { EmergencyNumber, HelplineCategory } from "@/types";

const ORDER: HelplineCategory[] = ["emergency", "women", "police", "ambulance", "child", "fire", "cyber", "disaster", "other"];

export function HelplinesList() {
  const t = useT();
  const { helplines, user, demo } = useAppData();
  const region = SUPPORTED_REGIONS.find((r) => r.code === user.preferences.region)?.name ?? user.preferences.region;
  const groups = ORDER.map((c) => ({ category: c, items: helplines.filter((h) => h.category === c) })).filter((g) => g.items.length);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("helplines.title")} description={t("helplines.description")} />
      <div className="mb-6 flex gap-3 rounded-[var(--radius-panel)] bg-surface p-4 text-[15px] leading-relaxed ring-1 ring-inset ring-line">
        <Info className="mt-0.5 size-5 shrink-0 text-navy-700" aria-hidden />
        <p>
          {t("helplines.regionNote", { region })}{" "}
          <Link href="/app/settings#preferences" className="font-semibold underline">
            {t("helplines.changeRegion")}
          </Link>
        </p>
      </div>
      <div className="flex flex-col gap-8">
        {groups.map((g) => (
          <section key={g.category} aria-labelledby={`hl-${g.category}`}>
            <h2 id={`hl-${g.category}`} className="mb-3 text-sm font-bold uppercase tracking-[0.06em] text-ink-3">
              {t(`helplines.category.${g.category}`)}
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {g.items.map((h: EmergencyNumber) => (
                <li key={h.id}>
                  <Panel as="article" className={cn("flex h-full flex-col p-5", h.category === "emergency" && "ring-2 ring-sos/40")}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-[17px] font-bold leading-snug">{h.name}</h3>
                        <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{h.purpose}</p>
                      </div>
                      <p className={cn("tabular shrink-0 text-[28px] font-extrabold leading-none tracking-[-0.02em]", h.category === "emergency" ? "text-sos-ink" : "text-ink")}>{h.number}</p>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-ink-3">{h.availabilityNotes}</p>
                    <p className="mt-1 text-xs font-semibold text-ink-3">{h.region === "IN" ? t("helplines.nationwide") : region}</p>
                    <div className="mt-auto pt-4">
                      <CallButton number={h.number} label={`${t("helplines.call")} ${h.number}`} emergencyService demo={demo} variant={h.category === "emergency" ? "sos" : "default"} block />
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm leading-relaxed text-ink-3">{t("helplines.disclaimer")}</p>
    </div>
  );
}
