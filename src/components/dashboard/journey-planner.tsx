"use client";

import { Check, Flag, MapPin, Navigation, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LocationMap, type MapPoint } from "@/components/maps/location-map";
import { useAppData } from "@/components/providers/app-data-provider";
import { useLocation } from "@/components/providers/location-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Notice, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/hooks/use-api";
import { api, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/client";
import { distanceMeters, formatCoords, formatDistance } from "@/lib/location/geo";
import { cn } from "@/lib/utils";
import type { SafeJourney } from "@/types";

const ETA_PRESETS = [15, 30, 45, 60, 120];
const GRACE = [10, 15, 30];
const ARRIVAL_RADIUS_M = 150;
const PING_MS = 60_000;

function nextOccurrence(hhmm: string, now: number): Date | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(now);
  d.setHours(h!, m!, 0, 0);
  if (d.getTime() < now + 60_000) d.setDate(d.getDate() + 1);
  return d;
}

function StartForm({ onStarted }: { onStarted: (j: SafeJourney) => void }) {
  const { t, formatTime } = useI18n();
  const { contacts } = useAppData();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [dest, setDest] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ label: string; lat: number; lng: number }>>([]);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(30);
  const [etaTime, setEtaTime] = useState("");
  const [grace, setGrace] = useState(15);
  const [selected, setSelected] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Default to the primary contact once contacts load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected.length === 0 && contacts.length) setSelected([contacts.find((c) => c.isPrimary)?.id ?? contacts[0]!.id]);
  }, [contacts, selected.length]);

  const search = (q: string) => {
    setQuery(q);
    setDest(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 3) return setSuggestions([]);
    debounce.current = setTimeout(async () => {
      const near = location.fix ?? location.lastKnown;
      const qs = new URLSearchParams({ q });
      if (near) {
        qs.set("lat", near.lat.toFixed(3));
        qs.set("lng", near.lng.toFixed(3));
      }
      try {
        const { results } = await api<{ results: typeof suggestions }>(`/api/geocode/search?${qs}`);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      }
    }, 450);
  };

  const eta = etaTime ? nextOccurrence(etaTime, now) : etaMinutes ? new Date(now + etaMinutes * 60_000) : null;
  const names = contacts.filter((c) => selected.includes(c.id)).map((c) => c.name.split(" ")[0]);

  if (contacts.length === 0) {
    return (
      <Notice tone="warn" title={t("journey.needContacts")} action={<Button asChild><Link href="/app/contacts?add=1">{t("contacts.addFirst")}</Link></Button>} />
    );
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const label = dest?.label ?? query.trim();
        const fe: Record<string, string> = {};
        if (!label) fe.destination = t("journey.errors.destination");
        if (!eta) fe.eta = t("journey.errors.eta");
        if (selected.length === 0) fe.contacts = t("journey.errors.contacts");
        setErrors(fe);
        if (Object.keys(fe).length) return;
        setBusy(true);
        const here = location.fix ?? (await location.requestFix({ highAccuracy: false, timeoutMs: 6000 }));
        try {
          const { journey } = await api<{ journey: SafeJourney }>("/api/journey/start", {
            body: {
              destinationLabel: label,
              destination: dest ? { lat: dest.lat, lng: dest.lng } : null,
              expectedArrivalAt: eta!.toISOString(),
              graceMinutes: grace,
              contactIds: selected,
              location: here ? { lat: here.lat, lng: here.lng, accuracy: here.accuracy } : null,
            },
          });
          onStarted(journey);
          toast.success(t("journey.started"));
        } catch (err) {
          toast.error((err as ClientApiError).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="relative">
        <Field id="j-dest" label={t("journey.destination")} hint={t("journey.destinationHint")} error={errors.destination}>
          <Input value={dest?.label ?? query} onChange={(e) => search(e.target.value)} autoComplete="off" placeholder={t("journey.destinationPlaceholder")} />
        </Field>
        <Search className="pointer-events-none absolute right-4 top-[46px] size-5 text-ink-3" aria-hidden />
        {suggestions.length > 0 && !dest ? (
          <ul role="listbox" aria-label={t("journey.suggestions")} className="absolute inset-x-0 top-[84px] z-10 overflow-hidden rounded-[var(--radius-control)] bg-surface shadow-[var(--shadow-lift)] ring-1 ring-line">
            {suggestions.map((s) => (
              <li key={`${s.lat},${s.lng}`} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => {
                    setDest(s);
                    setSuggestions([]);
                  }}
                  className="flex min-h-12 w-full items-center gap-2.5 px-4 py-2 text-left text-[15px] hover:bg-ground"
                >
                  <MapPin className="size-4 shrink-0 text-ink-3" aria-hidden />
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <fieldset>
        <legend className="mb-2 text-[15px] font-semibold">{t("journey.expectedArrival")}</legend>
        <div className="grid grid-cols-5 gap-2">
          {ETA_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={etaMinutes === m && !etaTime}
              onClick={() => {
                setEtaMinutes(m);
                setEtaTime("");
              }}
              className={cn(
                "tabular h-12 rounded-[var(--radius-control)] text-sm font-bold ring-1 ring-inset",
                etaMinutes === m && !etaTime ? "bg-navy-900 text-white ring-navy-900" : "bg-surface ring-line-strong hover:bg-ground",
              )}
            >
              {m < 60 ? t("checkin.minutesShort", { count: m }) : t("checkin.hoursShort", { count: m / 60 })}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <label htmlFor="j-time" className="text-sm font-semibold text-ink-2">
            {t("journey.orArriveBy")}
          </label>
          <Input id="j-time" type="time" value={etaTime} onChange={(e) => setEtaTime(e.target.value)} className="h-11 w-36" />
        </div>
        {errors.eta ? <p role="alert" className="mt-2 text-sm font-medium text-sos-ink">{errors.eta}</p> : null}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[15px] font-semibold">{t("journey.whoToNotify")}</legend>
        <div className="flex flex-col gap-2">
          {contacts.map((c) => {
            const on = selected.includes(c.id);
            return (
              <label key={c.id} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-4 ring-1 ring-inset", on ? "bg-navy-900 text-white ring-navy-900" : "bg-surface ring-line-strong")}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setSelected((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                  className="size-5 accent-white"
                />
                <span className="flex-1 font-semibold">{c.name}</span>
                <span className={cn("text-sm", on ? "text-navy-200" : "text-ink-3")}>{t(`relationship.${c.relationship}`)}</span>
              </label>
            );
          })}
        </div>
        {errors.contacts ? <p role="alert" className="mt-2 text-sm font-medium text-sos-ink">{errors.contacts}</p> : null}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[15px] font-semibold">{t("journey.grace")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {GRACE.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={grace === g}
              onClick={() => setGrace(g)}
              className={cn("tabular h-12 rounded-[var(--radius-control)] text-sm font-bold ring-1 ring-inset", grace === g ? "bg-navy-900 text-white ring-navy-900" : "bg-surface ring-line-strong")}
            >
              {t("checkin.minutesShort", { count: g })}
            </button>
          ))}
        </div>
      </fieldset>

      {eta ? (
        <p className="rounded-[var(--radius-control)] bg-surface p-4 text-[15px] leading-relaxed ring-1 ring-inset ring-line">
          {t("journey.summary", {
            time: formatTime(eta),
            alertTime: formatTime(eta.getTime() + grace * 60_000),
            names: names.join(", ") || "—",
          })}
        </p>
      ) : null}
      <Button type="submit" size="xl" block loading={busy}>
        <Navigation aria-hidden />
        {t("journey.start")}
      </Button>
      <p className="text-sm leading-relaxed text-ink-3">{t("journey.noPolice")}</p>
    </form>
  );
}

function ActiveJourney({ journey, onDone }: { journey: SafeJourney; onDone: () => void }) {
  const { t, formatTime } = useI18n();
  const location = useLocation();
  const { contacts } = useAppData();
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Share progress while the page is open. Escalation itself runs on the server on schedule,
  // so it still happens if this phone is switched off.
  useEffect(() => {
    let last = 0;
    const stop = location.track((fix) => {
      if (Date.now() - last < PING_MS) return;
      last = Date.now();
      void api("/api/journey/location", { body: { journeyId: journey.id, location: { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } } }).catch(() => undefined);
    }, false);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey.id]);

  const eta = new Date(journey.expectedArrivalAt).getTime();
  const alertAt = eta + journey.graceMinutes * 60_000;
  const late = now > eta;
  const escalated = journey.status === "escalated";
  const here = location.fix;
  const dest = useMemo(
    () => (journey.destLat != null && journey.destLng != null ? { lat: journey.destLat, lng: journey.destLng } : null),
    [journey.destLat, journey.destLng],
  );
  const remainingM = here && dest ? distanceMeters(here, dest) : null;
  const arrivedNearby = remainingM !== null && remainingM <= ARRIVAL_RADIUS_M;
  const names = contacts.filter((c) => journey.contactIds.includes(c.id)).map((c) => c.name.split(" ")[0]).join(", ");

  const points = useMemo<MapPoint[]>(() => {
    const p: MapPoint[] = [];
    if (dest) p.push({ id: "dest", ...dest, label: journey.destinationLabel, kind: "destination" });
    if (here) p.push({ id: "me", lat: here.lat, lng: here.lng, label: t("nearby.you"), kind: "user" });
    return p;
  }, [dest, here, journey.destinationLabel, t]);

  const finish = async (action: "arrived" | "cancel") => {
    setBusy(action);
    try {
      await api("/api/journey/complete", { body: { journeyId: journey.id, action } });
      toast.success(action === "arrived" ? t("journey.arrivedToast") : t("journey.cancelledToast"));
      onDone();
    } catch (err) {
      toast.error((err as ClientApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const mins = Math.max(0, Math.ceil(((late ? alertAt : eta) - now) / 60_000));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel className={cn("p-5", late && !escalated && "ring-2 ring-warn", escalated && "ring-2 ring-sos")}>
        <div className="flex items-center justify-between gap-3">
          <Badge tone={escalated ? "sos" : late ? "warn" : "safe"}>{escalated ? t("journey.status.escalated") : late ? t("journey.status.late") : t("journey.status.onTrack")}</Badge>
          <span className="text-sm text-ink-3">{t("journey.startedAt", { time: formatTime(journey.startedAt) })}</span>
        </div>
        <h2 className="mt-3 text-2xl font-extrabold leading-tight tracking-[-0.02em]">{t("journey.activeTo", { destination: journey.destinationLabel })}</h2>
        <dl className="tabular mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
          <div>
            <dt className="text-ink-3">{t("journey.etaLabel")}</dt>
            <dd className="text-lg font-bold">{formatTime(eta)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">{late ? t("journey.contactsAlertedIn") : t("journey.timeLeft")}</dt>
            <dd className={cn("text-lg font-bold", late && "text-warn")}>{escalated ? "—" : t("journey.minutes", { count: mins })}</dd>
          </div>
          <div>
            <dt className="text-ink-3">{t("journey.from")}</dt>
            <dd className="font-semibold">{journey.startLat != null ? formatCoords({ lat: journey.startLat, lng: journey.startLng! }, 4) : t("journey.unknownStart")}</dd>
          </div>
          <div>
            <dt className="text-ink-3">{t("journey.distanceLeft")}</dt>
            <dd className="font-semibold">{remainingM !== null ? formatDistance(remainingM) : "—"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
          {escalated ? t("journey.escalatedBody") : t("journey.watching", { names, time: formatTime(alertAt) })}
        </p>
        {arrivedNearby && !escalated ? <Notice className="mt-4" tone="success" title={t("journey.looksArrived")} /> : null}
        <Button size="xl" variant="safe" block className="mt-5" loading={busy === "arrived"} onClick={() => void finish("arrived")}>
          <Flag aria-hidden />
          {t("journey.arrived")}
        </Button>
        {!escalated ? (
          <Button variant="ghost" block className="mt-2" loading={busy === "cancel"} onClick={() => void finish("cancel")}>
            <X aria-hidden />
            {t("journey.cancel")}
          </Button>
        ) : null}
        <p className="mt-4 text-xs leading-relaxed text-ink-3">{t("journey.keepOpen")}</p>
      </Panel>
      {points.length ? (
        <LocationMap
          center={here ?? dest!}
          points={points}
          zoom={14}
          label={t("journey.mapLabel")}
          failedLabel={t("nearby.mapFailed")}
          className="h-72 overflow-hidden rounded-[var(--radius-panel)] ring-1 ring-line lg:h-full lg:min-h-[420px]"
        />
      ) : null}
    </div>
  );
}

export function JourneyPlanner() {
  const { t } = useI18n();
  const { data, loading, mutate, reload } = useApi<{ journey: SafeJourney | null }>("/api/journey", { refreshMs: 30_000 });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("journey.title")} description={t("journey.description")} />
      {loading && !data ? (
        <Skeleton className="h-96 rounded-[var(--radius-panel)]" />
      ) : data?.journey ? (
        <ActiveJourney journey={data.journey} onDone={() => mutate(() => ({ journey: null }))} />
      ) : (
        <Panel className="max-w-2xl p-5 sm:p-6">
          <StartForm
            onStarted={(journey) => {
              mutate(() => ({ journey }));
              void reload();
            }}
          />
        </Panel>
      )}
      <p className="mt-6 flex items-center gap-2 text-sm text-ink-3">
        <Check className="size-4" aria-hidden />
        {t("journey.footer")}
      </p>
    </div>
  );
}
