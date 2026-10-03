"use client";

import { Activity, Database, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, Notice, Panel, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/hooks/use-api";
import { useI18n } from "@/lib/i18n/client";
import type { AdminStats, EmergencySummary } from "@/lib/db/repository";

interface AdminData {
  stats: AdminStats;
  health: { database: string; providers: Record<string, string | boolean>; time: string };
  recentEmergencies: EmergencySummary[];
  audit: Array<{ id: string; action: string; actor: string; targetType: string | null; createdAt: string }>;
}

const CHANNELS = ["sms", "email", "push"] as const;
const STATUSES = ["sent", "simulated", "pending", "failed", "skipped"] as const;

export function AdminDashboard() {
  const { t, formatDateTime, formatNumber } = useI18n();
  const { data, error, loading, reload } = useApi<AdminData>("/api/admin/stats", { refreshMs: 30_000 });

  if (error && !data) return <Notice tone="error" title={error.message} action={<Button onClick={() => void reload()}>{t("common.retry")}</Button>} />;
  if (loading && !data) return <Skeleton className="h-96 rounded-[var(--radius-panel)]" />;
  if (!data) return null;
  const s = data.stats;
  const count = (c: string, st: string) => s.notifications.find((n) => n.channel === c && n.status === st)?.count ?? 0;
  const figures = [
    { label: t("admin.users"), value: s.users },
    { label: t("admin.activeEmergencies"), value: s.activeEmergencies, alert: s.activeEmergencies > 0 },
    { label: t("admin.last24h"), value: s.emergenciesLast24h },
    { label: t("admin.last30d"), value: s.emergenciesLast30d },
    { label: t("admin.activeCheckIns"), value: s.activeCheckIns },
    { label: t("admin.activeJourneys"), value: s.activeJourneys },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-3">{t("admin.updated", { time: formatDateTime(data.health.time) })}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            <RefreshCw aria-hidden />
            {t("common.refresh")}
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/helplines">{t("admin.manageHelplines")}</Link>
          </Button>
        </div>
      </div>

      <Panel className="overflow-hidden">
        <dl className="grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-6 [&>div]:border-line [&>div]:p-4 [&>div:not(:last-child)]:border-b sm:[&>div]:border-r lg:[&>div]:border-b-0">
          {figures.map((f) => (
            <div key={f.label}>
              <dt className="text-sm text-ink-3">{f.label}</dt>
              <dd className={`tabular mt-1 text-2xl font-extrabold ${f.alert ? "text-sos-ink" : ""}`}>{formatNumber(f.value)}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="delivery">
          <h2 id="delivery" className="mb-3 text-lg font-extrabold">{t("admin.delivery")}</h2>
          <Panel className="overflow-x-auto">
            <table className="tabular w-full text-sm">
              <caption className="sr-only">{t("admin.delivery")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-ink-3">
                  <th scope="col" className="p-3 font-semibold">{t("admin.channel")}</th>
                  {STATUSES.map((st) => (
                    <th key={st} scope="col" className="p-3 text-right font-semibold">{t(`delivery.${st}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CHANNELS.map((c) => (
                  <tr key={c} className="border-b border-line last:border-0">
                    <th scope="row" className="p-3 text-left font-semibold">{t(`contacts.channel.${c}`)}</th>
                    {STATUSES.map((st) => (
                      <td key={st} className={`p-3 text-right ${st === "failed" && count(c, st) ? "font-bold text-sos-ink" : ""}`}>{count(c, st)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="p-3 pt-0 text-xs text-ink-3">{t("admin.deliveryNote")}</p>
          </Panel>
        </section>

        <section aria-labelledby="health">
          <h2 id="health" className="mb-3 text-lg font-extrabold">{t("admin.health")}</h2>
          <Panel className="p-4">
            <ul className="flex flex-col gap-2.5 text-[15px]">
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Database className="size-4 text-ink-3" aria-hidden />{t("admin.database")}</span>
                <Badge tone={data.health.database === "ok" ? "safe" : "sos"}>{data.health.database} · {String(data.health.providers.database)}</Badge>
              </li>
              {Object.entries(data.health.providers)
                .filter(([k]) => k !== "database")
                .map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><Activity className="size-4 text-ink-3" aria-hidden />{t(`admin.provider.${k}`)}</span>
                    <Badge tone={v === "none" || v === "disabled" || v === true ? "warn" : "neutral"}>{String(v)}</Badge>
                  </li>
                ))}
            </ul>
          </Panel>
        </section>
      </div>

      <section aria-labelledby="recent">
        <h2 id="recent" className="mb-1 text-lg font-extrabold">{t("admin.recent")}</h2>
        <p className="mb-3 text-sm text-ink-3">{t("admin.privacyNote")}</p>
        <Panel className="overflow-x-auto">
          <table className="tabular w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-3">
                <th scope="col" className="p-3 font-semibold">{t("admin.event")}</th>
                <th scope="col" className="p-3 font-semibold">{t("admin.status")}</th>
                <th scope="col" className="p-3 font-semibold">{t("admin.trigger")}</th>
                <th scope="col" className="p-3 font-semibold">{t("admin.started")}</th>
                <th scope="col" className="p-3 text-right font-semibold">{t("delivery.sent")}</th>
                <th scope="col" className="p-3 text-right font-semibold">{t("delivery.failed")}</th>
              </tr>
            </thead>
            <tbody>
              {data.recentEmergencies.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-ink-3">{t("admin.noEmergencies")}</td></tr>
              ) : (
                data.recentEmergencies.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="p-3 font-semibold">{e.id.slice(0, 8).toUpperCase()} {e.isDemo ? <Badge tone="warn">{t("demo.badge")}</Badge> : null}</td>
                    <td className="p-3"><Badge tone={e.status === "active" ? "sos" : e.status === "resolved" ? "safe" : "neutral"}>{t(`history.status.${e.status}`)}</Badge></td>
                    <td className="p-3">{t(`trigger.${e.triggerMethod}`)}</td>
                    <td className="p-3">{formatDateTime(e.startedAt)}</td>
                    <td className="p-3 text-right">{e.notificationsSent}</td>
                    <td className={`p-3 text-right ${e.notificationsFailed ? "font-bold text-sos-ink" : ""}`}>{e.notificationsFailed}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Panel>
      </section>

      <section aria-labelledby="audit">
        <h2 id="audit" className="mb-3 text-lg font-extrabold">{t("admin.audit")}</h2>
        <Panel className="max-h-96 overflow-y-auto">
          <ul className="divide-y divide-line text-sm">
            {data.audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="font-mono text-[13px]">{a.action}</span>
                <span className="tabular text-ink-3">{a.actor} · {formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>
    </div>
  );
}
