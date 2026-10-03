"use client";

import { AlarmClock, CloudUpload, Download, Mic, Navigation, Siren, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Notice, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/hooks/use-api";
import { api, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/client";
import { recordingsDb, type LocalRecording } from "@/lib/offline/recordings-db";
import { cn } from "@/lib/utils";
import type { CheckIn, Recording, SafeJourney } from "@/types";

interface EmergencyEntry {
  id: string;
  status: "active" | "cancelled" | "resolved";
  triggerMethod: string;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  address: string | null;
  hadLocation: boolean;
  isDemo: boolean;
  contactsNotified: number;
  notificationsFailed: number;
  recordings: number;
}

interface HistoryData {
  emergencies: EmergencyEntry[];
  checkIns: Omit<CheckIn, "lastLat" | "lastLng">[];
  journeys: Omit<SafeJourney, "lastLat" | "lastLng" | "startLat" | "startLng" | "destLat" | "destLng">[];
}

type Item =
  | { kind: "emergency"; at: string; data: EmergencyEntry }
  | { kind: "checkin"; at: string; data: HistoryData["checkIns"][number] }
  | { kind: "journey"; at: string; data: HistoryData["journeys"][number] };

const FILTERS = ["all", "emergency", "checkin", "journey"] as const;

function minutesBetween(a: string, b: string | null) {
  if (!b) return null;
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}

function LocalRecordings() {
  const { t, formatDateTime } = useI18n();
  const [items, setItems] = useState<LocalRecording[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const refresh = useCallback(async () => {
    try {
      setItems((await recordingsDb.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch {
      setItems([]);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls]);

  if (!items || items.length === 0) return null;
  return (
    <section aria-labelledby="local-rec" className="mt-10">
      <h2 id="local-rec" className="text-xl font-extrabold tracking-[-0.01em]">{t("history.deviceRecordings")}</h2>
      <p className="mt-1 text-[15px] text-ink-2">{t("history.deviceRecordingsHint")}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((r) => (
          <li key={r.id}>
            <Panel className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{formatDateTime(r.createdAt)}</p>
                <span className="tabular text-sm text-ink-3">
                  {Math.round(r.durationSeconds)} s · {(r.size / 1024).toFixed(0)} KB {r.uploaded ? `· ${t("history.uploaded")}` : ""}
                </span>
              </div>
              {urls[r.id] ? (
                <audio controls src={urls[r.id]} className="mt-3 w-full" />
              ) : (
                <Button variant="outline" className="mt-3" onClick={() => setUrls((u) => ({ ...u, [r.id]: URL.createObjectURL(r.blob) }))}>
                  <Mic aria-hidden />
                  {t("history.play")}
                </Button>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {!r.uploaded && r.eventId ? (
                  <Button
                    variant="subtle"
                    onClick={async () => {
                      const form = new FormData();
                      form.set("file", r.blob, `segment.${r.mimeType.split("/")[1] ?? "webm"}`);
                      form.set("eventId", r.eventId!);
                      form.set("durationSeconds", String(r.durationSeconds));
                      const res = await fetch("/api/recordings", { method: "POST", body: form }).catch(() => null);
                      if (res?.ok) {
                        await recordingsDb.markUploaded(r.id);
                        toast.success(t("history.uploadDone"));
                        void refresh();
                      } else toast.error(t("history.uploadFailed"));
                    }}
                  >
                    <CloudUpload aria-hidden />
                    {t("history.upload")}
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  onClick={async () => {
                    await recordingsDb.remove(r.id);
                    toast.success(t("history.deletedFromDevice"));
                    void refresh();
                  }}
                >
                  <Trash2 aria-hidden />
                  {t("history.deleteFromDevice")}
                </Button>
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CloudRecordings() {
  const { t, formatDateTime } = useI18n();
  const { data, reload } = useApi<{ recordings: Omit<Recording, "storageKey">[] }>("/api/recordings");
  if (!data?.recordings.length) return null;
  return (
    <section aria-labelledby="cloud-rec" className="mt-10">
      <h2 id="cloud-rec" className="text-xl font-extrabold tracking-[-0.01em]">{t("history.cloudRecordings")}</h2>
      <ul className="mt-4 flex flex-col gap-2">
        {data.recordings.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] bg-surface p-3 ring-1 ring-inset ring-line">
            <span className="flex-1 text-[15px] font-semibold">{formatDateTime(r.createdAt)}</span>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/recordings/${r.id}`}>
                <Download aria-hidden />
                {t("history.download")}
              </a>
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                try {
                  await api(`/api/recordings/${r.id}`, { method: "DELETE" });
                  toast.success(t("history.deletedCloud"));
                  void reload();
                } catch (err) {
                  toast.error((err as ClientApiError).message);
                }
              }}
            >
              <Trash2 aria-hidden />
              {t("common.delete")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HistoryTimeline() {
  const { t, formatDate, formatTime } = useI18n();
  const { data, loading, error, reload } = useApi<HistoryData>("/api/history");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const groups = useMemo(() => {
    if (!data) return [];
    const items: Item[] = [
      ...data.emergencies.map((e) => ({ kind: "emergency" as const, at: e.startedAt, data: e })),
      ...data.checkIns.map((c) => ({ kind: "checkin" as const, at: c.startedAt, data: c })),
      ...data.journeys.map((j) => ({ kind: "journey" as const, at: j.startedAt, data: j })),
    ]
      .filter((i) => filter === "all" || i.kind === filter)
      .sort((a, b) => b.at.localeCompare(a.at));
    const map = new Map<string, Item[]>();
    for (const i of items) {
      const key = formatDate(i.at);
      map.set(key, [...(map.get(key) ?? []), i]);
    }
    return [...map.entries()];
  }, [data, filter, formatDate]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("history.title")} description={t("history.description")} />
      <div role="tablist" aria-label={t("history.filterLabel")} className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn("h-11 shrink-0 rounded-full px-4 text-[15px] font-semibold ring-1 ring-inset", filter === f ? "bg-navy-900 text-white ring-navy-900" : "bg-surface ring-line-strong hover:bg-ground")}
          >
            {t(`history.filter.${f}`)}
          </button>
        ))}
      </div>

      {error && !data ? (
        <Notice tone="error" title={error.isNetwork ? t("history.offline") : error.message} action={<Button onClick={() => void reload()}>{t("common.retry")}</Button>} />
      ) : loading && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 rounded-[var(--radius-panel)]" />
          <Skeleton className="h-28 rounded-[var(--radius-panel)]" />
        </div>
      ) : groups.length === 0 ? (
        <Panel className="p-6">
          <p className="font-bold">{t("history.emptyTitle")}</p>
          <p className="mt-1 text-[15px] text-ink-2">{t("history.emptyBody")}</p>
        </Panel>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([date, items]) => (
            <section key={date} aria-label={date}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.06em] text-ink-3">{date}</h2>
              <ol className="flex flex-col gap-3">
                {items.map((item) => (
                  <li key={`${item.kind}-${item.data.id}`}>
                    <Panel as="article" className="flex gap-4 p-4">
                      <p className="tabular w-[72px] shrink-0 pt-0.5 text-[15px] font-bold">{formatTime(item.at)}</p>
                      <div className="min-w-0 flex-1">
                        {item.kind === "emergency" ? (
                          <>
                            <p className="flex flex-wrap items-center gap-2 text-[17px] font-extrabold">
                              <Siren className="size-5 text-sos" aria-hidden />
                              {item.data.triggerMethod === "checkin_missed"
                                ? t("history.missedCheckIn")
                                : item.data.triggerMethod === "journey_overdue"
                                  ? t("history.overdueJourney")
                                  : t("history.sosTriggered")}
                              {item.data.isDemo ? <Badge tone="warn">{t("demo.badge")}</Badge> : null}
                            </p>
                            <p className="mt-1 text-sm text-ink-3">{t(`trigger.${item.data.triggerMethod}`)}</p>
                            <ul className="mt-2 flex flex-col gap-0.5 text-[15px] text-ink-2">
                              <li>{item.data.hadLocation ? t("history.locationShared") : t("history.noLocation")}</li>
                              <li>{t("history.contactsNotified", { count: item.data.contactsNotified })}{item.data.notificationsFailed ? ` · ${t("history.failedCount", { count: item.data.notificationsFailed })}` : ""}</li>
                              {item.data.address ? <li className="text-ink-3">{item.data.address}</li> : null}
                            </ul>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Badge tone={item.data.status === "active" ? "sos" : item.data.status === "resolved" ? "safe" : "neutral"}>
                                {t(`history.status.${item.data.status}`)}
                                {minutesBetween(item.data.startedAt, item.data.endedAt) ? ` · ${t("ended.minutes", { count: minutesBetween(item.data.startedAt, item.data.endedAt)! })}` : ""}
                              </Badge>
                              {item.data.recordings ? <Badge tone="navy"><Mic className="size-3" aria-hidden />{t("history.recordingAvailable")}</Badge> : null}
                            </div>
                          </>
                        ) : item.kind === "checkin" ? (
                          <>
                            <p className="flex items-center gap-2 text-[17px] font-bold">
                              <AlarmClock className="size-5 text-safe" aria-hidden />
                              {t("history.checkIn")}
                            </p>
                            <p className="mt-1 text-[15px] text-ink-2">{t("history.checkInDue", { time: formatTime(item.data.dueAt) })}</p>
                            <Badge className="mt-2" tone={item.data.status === "completed" ? "safe" : item.data.status === "escalated" ? "sos" : item.data.status === "active" ? "warn" : "neutral"}>
                              {t(`history.checkinStatus.${item.data.status}`)}
                            </Badge>
                          </>
                        ) : (
                          <>
                            <p className="flex items-center gap-2 text-[17px] font-bold">
                              <Navigation className="size-5 text-navy-700" aria-hidden />
                              {t("history.journeyTo", { destination: item.data.destinationLabel })}
                            </p>
                            <p className="mt-1 text-[15px] text-ink-2">{t("journey.eta", { time: formatTime(item.data.expectedArrivalAt) })}</p>
                            <Badge className="mt-2" tone={item.data.status === "completed" ? "safe" : item.data.status === "escalated" ? "sos" : item.data.status === "active" ? "warn" : "neutral"}>
                              {t(`history.journeyStatus.${item.data.status}`)}
                            </Badge>
                          </>
                        )}
                      </div>
                    </Panel>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      <LocalRecordings />
      <CloudRecordings />
    </div>
  );
}
