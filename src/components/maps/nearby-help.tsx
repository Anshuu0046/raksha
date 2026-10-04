"use client";

import { Clock, LocateFixed, Navigation, Phone, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CallButton } from "@/components/emergency/call-button";
import { useAppData } from "@/components/providers/app-data-provider";
import { useLocation } from "@/components/providers/location-provider";
import { Button } from "@/components/ui/button";
import { Badge, Notice, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/client";
import { directionsLink, formatDistance } from "@/lib/location/geo";
import { cn } from "@/lib/utils";
import type { NearbyPlace } from "@/types";
import { LocationMap, type MapPoint } from "./location-map";

const CATEGORIES = ["all", "police", "hospital", "clinic", "pharmacy", "emergency"] as const;
type Category = (typeof CATEGORIES)[number];

function OpenBadge({ status }: { status: NearbyPlace["openStatus"] }) {
  const { t } = useI18n();
  if (status === "24h") return <Badge tone="safe">{t("nearby.open24h")}</Badge>;
  if (status === "open") return <Badge tone="safe">{t("nearby.openNow")}</Badge>;
  if (status === "closed") return <Badge tone="warn">{t("nearby.closed")}</Badge>;
  return <Badge>{t("nearby.hoursUnknown")}</Badge>;
}

export function NearbyHelp() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const location = useLocation();
  const { demo, primary } = useAppData();
  const initial = (params.get("category") as Category) || "all";
  const [category, setCategory] = useState<Category>(CATEGORIES.includes(initial) ? initial : "all");
  const [places, setPlaces] = useState<NearbyPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [useLastKnown, setUseLastKnown] = useState(false);

  const position = location.fix ?? (useLastKnown ? location.lastKnown : null);

  // If she already allowed location, fetch it on arrival instead of asking for another tap.
  const autoRequested = useRef(false);
  useEffect(() => {
    if (autoRequested.current || location.fix || location.permission !== "granted") return;
    autoRequested.current = true;
    void location.requestFix({ highAccuracy: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.permission, location.fix]);
  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  });
  // Refetch when the user moves ~100 m, not on every GPS jitter.
  const latKey = position ? position.lat.toFixed(3) : null;
  const lngKey = position ? position.lng.toFixed(3) : null;

  const load = useCallback(async () => {
    const position = positionRef.current;
    if (!position || latKey === null || lngKey === null) return;
    setLoading(true);
    setError(null);
    try {
      const { places: list } = await api<{ places: NearbyPlace[] }>(
        `/api/nearby?lat=${position.lat.toFixed(5)}&lng=${position.lng.toFixed(5)}&category=${category}`,
      );
      setPlaces(list);
    } catch (err) {
      setError((err as ClientApiError).isNetwork ? t("nearby.offline") : (err as ClientApiError).message);
    } finally {
      setLoading(false);
    }
  }, [category, latKey, lngKey, t]);

  useEffect(() => {
     
    void load();
  }, [load]);

  const changeCategory = (c: Category) => {
    setCategory(c);
    setPlaces(null);
    router.replace(`/app/help?category=${c}`, { scroll: false });
  };

  const points = useMemo<MapPoint[]>(() => {
    const list: MapPoint[] = (places ?? []).slice(0, 25).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, label: p.name || t(`nearby.category.${p.category}`), kind: p.category }));
    if (position) list.unshift({ id: "me", lat: position.lat, lng: position.lng, label: t("nearby.you"), kind: "user" });
    return list;
  }, [places, position, t]);

  const lowAccuracy = position?.accuracy != null && position.accuracy > 500;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("nearby.title")}
        description={t("nearby.description")}
        action={
          <Button asChild variant="outline">
            <Link href="/app/helplines">
              <Phone aria-hidden />
              {t("nav.helplines")}
            </Link>
          </Button>
        }
      />

      <div role="tablist" aria-label={t("nearby.categoriesLabel")} className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            onClick={() => changeCategory(c)}
            className={cn(
              "h-11 shrink-0 rounded-full px-4 text-[15px] font-semibold ring-1 ring-inset transition-colors",
              category === c ? "bg-navy-900 text-white ring-navy-900" : "bg-surface text-ink ring-line-strong hover:bg-ground",
            )}
          >
            {t(`nearby.filter.${c}`)}
          </button>
        ))}
      </div>

      {!position ? (
        <Panel className="p-6">
          {location.permission === "denied" || location.status === "denied" ? (
            <Notice tone="error" title={t("nearby.locationBlocked")} action={<CallButton number={primary.emergency} label={`${t("helplines.call")} ${primary.emergency}`} emergencyService demo={demo} variant="sos" size="md" />}>
              {t("nearby.locationBlockedHelp")}
            </Notice>
          ) : location.status === "unavailable" || location.status === "timeout" || location.status === "unsupported" ? (
            <Notice
              tone="warn"
              title={t("nearby.locationUnavailable")}
              action={
                <>
                  <Button onClick={() => void location.requestFix()}>{t("common.retry")}</Button>
                  {location.lastKnown ? (
                    <Button variant="outline" onClick={() => setUseLastKnown(true)}>
                      {t("nearby.useLastKnown")}
                    </Button>
                  ) : null}
                </>
              }
            >
              {t("nearby.locationUnavailableHelp")}
            </Notice>
          ) : (
            <div className="flex flex-col items-start gap-4">
              <p className="max-w-[55ch] text-[15px] leading-relaxed text-ink-2">{t("nearby.needLocation")}</p>
              <Button size="lg" loading={location.status === "locating"} onClick={() => void location.requestFix({ highAccuracy: true })}>
                <LocateFixed aria-hidden />
                {t("nearby.useMyLocation")}
              </Button>
            </div>
          )}
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="order-2 flex flex-col gap-3 lg:order-1">
            {useLastKnown && !location.fix ? <Notice tone="warn" title={t("nearby.usingLastKnown")} /> : null}
            {lowAccuracy ? <Notice tone="warn" title={t("nearby.lowAccuracy", { meters: Math.round(position.accuracy!) })} /> : null}
            {error ? (
              <Notice tone="error" title={error} action={<><Button onClick={() => void load()}><RefreshCw aria-hidden />{t("common.retry")}</Button><Button asChild variant="outline"><Link href="/app/helplines">{t("nav.helplines")}</Link></Button></>} />
            ) : null}
            {loading && !places ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-[var(--radius-panel)]" />)
            ) : places && places.length === 0 && !error ? (
              <Notice tone="info" title={t("nearby.empty", { category: t(`nearby.filter.${category}`) })}>
                {t("nearby.emptyHelp")}
              </Notice>
            ) : (
              <ul className="flex flex-col gap-3" aria-busy={loading}>
                {(places ?? []).map((p) => (
                  <li key={p.id}>
                    <Panel as="article" className={cn("p-4 transition-shadow", selected === p.id && "ring-2 ring-navy-700")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink-3">{t(`nearby.category.${p.category}`)}</p>
                          <h2 className="text-[17px] font-bold leading-snug">{p.name || t("nearby.unnamed", { category: t(`nearby.category.${p.category}`) })}</h2>
                        </div>
                        <p className="tabular shrink-0 text-right text-lg font-extrabold">{formatDistance(p.distanceMeters, locale === "en" ? "en-IN" : `${locale}-IN`)}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <OpenBadge status={p.openStatus} />
                        {p.hoursText ? (
                          <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                            <Clock className="size-3.5" aria-hidden />
                            {p.hoursText}
                          </span>
                        ) : null}
                      </div>
                      {p.address ? <p className="mt-2 text-sm text-ink-2">{p.address}</p> : null}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {p.phone ? (
                          <CallButton number={p.phone} label={t("nearby.call")} emergencyService={p.category === "police" || p.category === "emergency"} demo={demo} size="md" />
                        ) : (
                          <Button variant="subtle" disabled>
                            {t("nearby.noPhone")}
                          </Button>
                        )}
                        <Button asChild variant="outline">
                          <a href={directionsLink(p)} target="_blank" rel="noopener noreferrer" onFocus={() => setSelected(p.id)}>
                            <Navigation aria-hidden />
                            {t("nearby.directions")}
                          </a>
                        </Button>
                      </div>
                    </Panel>
                  </li>
                ))}
              </ul>
            )}
            {places && places.length > 0 ? (
              <p className="text-xs text-ink-3">{places[0]!.source === "demo" ? t("nearby.sourceDemo") : places[0]!.source === "google" ? t("nearby.sourceGoogle") : t("nearby.sourceOsm")}</p>
            ) : null}
          </div>
          <div className="order-1 lg:order-2">
            <LocationMap
              center={position}
              accuracy={position.accuracy}
              points={points}
              label={t("nearby.mapLabel")}
              failedLabel={t("nearby.mapFailed")}
              onSelect={(id) => setSelected(id)}
              className="h-64 overflow-hidden rounded-[var(--radius-panel)] ring-1 ring-line sm:h-80 lg:sticky lg:top-6 lg:h-[560px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
