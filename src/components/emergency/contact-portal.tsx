"use client";

import { AlertTriangle, BatteryMedium, CheckCircle2, Navigation, Phone, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { LocationMap } from "@/components/maps/location-map";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/field";
import { api, ClientApiError } from "@/lib/api/client";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";
import { directionsLink, formatCoords, mapLink } from "@/lib/location/geo";
import { cn, firstName } from "@/lib/utils";
import type { EmergencyNumber, PublicEmergencyView } from "@/types";
import { CallButton } from "./call-button";

const REFRESH_MS = 15_000;
const STALE_MS = 5 * 60_000;

function LanguageSwitch() {
  const { t, locale } = useI18n();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-3">
      <span>{t("settings.language")}</span>
      <NativeSelect
        value={locale}
        className="h-10 w-44 text-sm"
        onChange={(e) => {
          document.cookie = `raksha_locale=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          window.location.reload();
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l].native}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

export function ContactPortal({
  token,
  initial,
  initialError,
  helplines,
  demo,
}: {
  token: string;
  initial: PublicEmergencyView | null;
  initialError: { code: string; message: string } | null;
  helplines: EmergencyNumber[];
  demo: boolean;
}) {
  const { t, formatTime, formatDateTime } = useI18n();
  const [view, setView] = useState(initial);
  const [error, setError] = useState(initialError);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setView(await api<PublicEmergencyView>(`/api/public/emergency/${token}`));
      setError(null);
      setFetchFailed(false);
    } catch (err) {
      const e = err as ClientApiError;
      if (e.isNetwork || e.code === "RATE_LIMITED" || e.status >= 500) setFetchFailed(true);
      else setError({ code: e.code, message: e.message });
    } finally {
      setRefreshing(false);
      setNow(Date.now());
    }
  }, [token]);

  useEffect(() => {
    if (!view || view.status !== "active") return;
    const id = setInterval(() => void refresh(), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(id);
      clearInterval(tick);
    };
  }, [refresh, view]);

  const points = useMemo(
    () => (view?.location ? [{ id: "her", lat: view.location.lat, lng: view.location.lng, label: view.name, kind: "user" as const }] : []),
    [view],
  );

  if (error || !view) {
    return (
      <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-12">
        <LogoMark className="size-10" />
        <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.02em]">{error?.code === "TOKEN_EXPIRED" ? t("portal.expiredTitle") : t("portal.invalidTitle")}</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{t("portal.invalidBody")}</p>
        <div className="mt-8 grid gap-2.5">
          {helplines.slice(0, 3).map((h) => (
            <CallButton key={h.id} number={h.number} label={`${h.name} · ${h.number}`} emergencyService demo={demo} variant={h.category === "emergency" ? "sos" : "outline"} size="lg" block />
          ))}
        </div>
      </main>
    );
  }

  const name = firstName(view.name);
  const active = view.status === "active";
  const lastAt = view.location ? new Date(view.location.recordedAt).getTime() : null;
  const stale = active && lastAt !== null && now - lastAt > STALE_MS;
  const minutesAgo = lastAt ? Math.max(0, Math.round((now - lastAt) / 60_000)) : null;
  const headline =
    view.triggerKind === "checkin"
      ? t("portal.headlineCheckin", { name })
      : view.triggerKind === "journey"
        ? t("portal.headlineJourney", { name })
        : t("portal.headlineSos", { name });

  return (
    <div className="min-h-dvh bg-ground">
      {view.isDemo ? <p className="bg-warn px-4 py-1.5 text-center text-[13px] font-bold uppercase tracking-[0.08em] text-white">{t("demo.badge")} · {t("portal.demoNote")}</p> : null}
      <header className={cn("px-5 pb-7 pt-6 text-white sm:px-8", active ? "bg-sos-deep" : view.status === "resolved" ? "bg-safe-ink" : "bg-navy-900")}>
        <div className="mx-auto max-w-3xl">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em] text-white/85">
            {active ? <span className="size-2.5 animate-beacon rounded-full bg-white" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            {active ? t("portal.alert") : t("portal.update")}
          </p>
          <h1 className="mt-3 text-[clamp(30px,8vw,48px)] font-extrabold leading-[1.02] tracking-[-0.03em]">
            {active ? headline : view.status === "resolved" ? t("portal.safeHeadline", { name }) : t("portal.cancelledHeadline", { name })}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px]">
            <span className="rounded-full bg-white px-3 py-1 text-sm font-extrabold uppercase tracking-[0.06em] text-ink">
              {t(`portal.status.${view.status}`)}
            </span>
            <span className="tabular text-white/90">{t("portal.triggeredAt", { time: formatDateTime(view.startedAt) })}</span>
            {view.endedAt ? <span className="tabular text-white/90">{t("portal.endedAt", { time: formatTime(view.endedAt) })}</span> : null}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-8">
        <div className="grid grid-cols-2 gap-2.5">
          {view.phone ? (
            <CallButton number={view.phone} label={t("portal.call", { name })} emergencyService={false} demo={demo} variant={active ? "sos" : "default"} size="xl" className="col-span-2 sm:col-span-1" />
          ) : (
            <p className="col-span-2 rounded-[var(--radius-control)] bg-surface p-4 text-[15px] text-ink-2 ring-1 ring-inset ring-line sm:col-span-1">{t("portal.noPhone")}</p>
          )}
          {view.location ? (
            <Button asChild size="xl" variant="default" className="col-span-2 sm:col-span-1">
              <a href={directionsLink(view.location)} target="_blank" rel="noopener noreferrer">
                <Navigation aria-hidden />
                {t("portal.directions")}
              </a>
            </Button>
          ) : null}
        </div>

        {active ? (
          <>
            {stale ? (
              <div role="alert" className="flex gap-3 rounded-[var(--radius-panel)] bg-warn-soft p-4 ring-1 ring-inset ring-warn/25">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
                <p className="text-[15px] leading-relaxed">{t("portal.stale", { minutes: minutesAgo ?? 0 })}</p>
              </div>
            ) : null}
            {fetchFailed ? <p role="status" className="text-sm font-semibold text-warn">{t("portal.refreshFailed")}</p> : null}
            <section aria-labelledby="loc-title" className="overflow-hidden rounded-[var(--radius-panel)] bg-surface shadow-[var(--shadow-panel)] ring-1 ring-line">
              {view.location ? (
                <LocationMap
                  center={view.location}
                  accuracy={view.location.accuracy}
                  points={points}
                  zoom={16}
                  label={t("portal.mapLabel", { name })}
                  failedLabel={t("portal.mapFailed")}
                  className="h-72 sm:h-96"
                />
              ) : (
                <div className="grid h-48 place-items-center bg-ground p-6 text-center text-[15px] text-ink-2">{t("portal.waitingLocation", { name })}</div>
              )}
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 id="loc-title" className="text-lg font-extrabold">{t("portal.currentLocation")}</h2>
                  <Button variant="outline" size="sm" loading={refreshing} onClick={() => void refresh()}>
                    <RefreshCw aria-hidden />
                    {t("portal.refresh")}
                  </Button>
                </div>
                {view.location ? (
                  <dl className="mt-3 grid gap-3 text-[15px] sm:grid-cols-2">
                    <div>
                      <dt className="text-sm text-ink-3">{t("portal.lastUpdated")}</dt>
                      <dd className="tabular font-bold">
                        {formatTime(view.location.recordedAt)} · {minutesAgo === 0 ? t("portal.justNow") : t("portal.minutesAgo", { count: minutesAgo ?? 0 })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-ink-3">{t("portal.coordinates")}</dt>
                      <dd className="tabular font-bold">
                        <a href={mapLink(view.location)} target="_blank" rel="noopener noreferrer" className="underline">
                          {formatCoords(view.location)}
                        </a>
                        {view.location.accuracy ? <span className="font-normal text-ink-3"> · ±{Math.round(view.location.accuracy)} m</span> : null}
                      </dd>
                    </div>
                    {view.address ? (
                      <div className="sm:col-span-2">
                        <dt className="text-sm text-ink-3">{t("portal.nearAddress")}</dt>
                        <dd className="font-semibold">{view.address}</dd>
                      </div>
                    ) : null}
                    {view.location.batteryLevel != null ? (
                      <div>
                        <dt className="text-sm text-ink-3">{t("portal.battery")}</dt>
                        <dd className="tabular flex items-center gap-1.5 font-bold">
                          <BatteryMedium className="size-4" aria-hidden />
                          {Math.round(view.location.batteryLevel * 100)}%
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                <p className="mt-4 text-xs text-ink-3">{t("portal.autoRefresh")}</p>
              </div>
            </section>

            <section aria-labelledby="todo-title" className="rounded-[var(--radius-panel)] bg-surface p-5 ring-1 ring-line">
              <h2 id="todo-title" className="text-lg font-extrabold">{t("portal.whatToDo")}</h2>
              <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed text-ink-2">
                <li>{t("portal.step1", { name })}</li>
                <li>{t("portal.step2", { name })}</li>
                <li>{t("portal.step3")}</li>
              </ol>
            </section>
          </>
        ) : (
          <section className="rounded-[var(--radius-panel)] bg-surface p-5 ring-1 ring-line">
            <p className="text-[17px] leading-relaxed">{view.endReason === "mistake" ? t("portal.endedMistake", { name }) : t("portal.endedSafe", { name })}</p>
            <p className="mt-2 text-[15px] text-ink-3">{t("portal.sharingStopped")}</p>
          </section>
        )}

        <section aria-labelledby="numbers-title">
          <h2 id="numbers-title" className="mb-3 text-sm font-bold uppercase tracking-[0.06em] text-ink-3">{t("portal.emergencyNumbers")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {helplines.slice(0, 6).map((h) => (
              <li key={h.id}>
                <CallButton
                  number={h.number}
                  label={<span className="flex w-full items-center justify-between gap-3"><span className="truncate">{h.name}</span><span className="tabular font-extrabold">{h.number}</span></span>}
                  emergencyService
                  demo={demo}
                  variant={h.category === "emergency" ? "sos" : "outline"}
                  size="lg"
                  block
                  icon={<Phone aria-hidden />}
                  className="justify-start [&>span]:w-full"
                />
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-4 flex flex-col gap-4 border-t border-line pt-5 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[46ch]">{t("portal.privacy")}</p>
          <LanguageSwitch />
        </footer>
      </main>
    </div>
  );
}
