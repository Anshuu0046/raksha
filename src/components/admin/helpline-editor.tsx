"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Badge, Notice, Panel, Skeleton } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useApi } from "@/hooks/use-api";
import { api, ClientApiError } from "@/lib/api/client";
import { useT } from "@/lib/i18n/client";
import type { EmergencyNumber, HelplineCategory } from "@/types";

const CATEGORIES: HelplineCategory[] = ["emergency", "police", "ambulance", "women", "child", "fire", "disaster", "cyber", "other"];

interface Data {
  config: EmergencyNumber[];
  overrides: EmergencyNumber[];
  regions: Array<{ code: string; name: string }>;
}

const blank: EmergencyNumber = {
  id: "",
  country: "IN",
  region: "IN",
  name: "",
  purpose: "",
  number: "",
  category: "other",
  availabilityNotes: "",
  priority: 100,
  active: true,
  updatedAt: "",
};

export function HelplineEditor() {
  const t = useT();
  const { data, loading, error, reload } = useApi<Data>("/api/admin/helplines");
  const [editing, setEditing] = useState<EmergencyNumber | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (error && !data) return <Notice tone="error" title={error.message} />;
  if (loading || !data) return <Skeleton className="h-96 rounded-[var(--radius-panel)]" />;

  const overridden = new Set(data.overrides.map((o) => `${o.id}|${o.region}`));
  const regionName = (code: string) => data.regions.find((r) => r.code === code)?.name ?? code;
  const set = <K extends keyof EmergencyNumber>(k: K, v: EmergencyNumber[K]) => setEditing((e) => (e ? { ...e, [k]: v } : e));

  return (
    <div className="flex flex-col gap-8">
      <Notice tone="info" title={t("admin.helplines.howTitle")}>{t("admin.helplines.how")}</Notice>
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ ...blank })}>
          <Plus aria-hidden />
          {t("admin.helplines.add")}
        </Button>
      </div>

      <section aria-labelledby="ov">
        <h2 id="ov" className="mb-3 text-lg font-extrabold">{t("admin.helplines.overrides")}</h2>
        {data.overrides.length === 0 ? (
          <p className="text-[15px] text-ink-3">{t("admin.helplines.noOverrides")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.overrides.map((h) => (
              <li key={`${h.id}-${h.region}`}>
                <Panel className="flex flex-wrap items-center gap-3 p-4">
                  <span className="tabular w-24 text-xl font-extrabold">{h.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{h.name} {!h.active ? <Badge tone="warn">{t("admin.helplines.inactive")}</Badge> : null}</span>
                    <span className="block text-sm text-ink-3">{regionName(h.region)} · {h.id}</span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setEditing(h)}>
                    <Pencil aria-hidden />
                    {t("common.edit")}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={async () => {
                      try {
                        await api("/api/admin/helplines", { method: "DELETE", body: { id: h.id } });
                        toast.success(t("admin.helplines.removed"));
                        void reload();
                      } catch (err) {
                        toast.error((err as ClientApiError).message);
                      }
                    }}
                  >
                    <Trash2 aria-hidden />
                    {t("admin.helplines.removeOverride")}
                  </Button>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cfg">
        <h2 id="cfg" className="mb-1 text-lg font-extrabold">{t("admin.helplines.config")}</h2>
        <p className="mb-3 text-sm text-ink-3">{t("admin.helplines.configHint")}</p>
        <ul className="flex flex-col gap-2">
          {data.config.map((h) => (
            <li key={h.id}>
              <Panel className="flex flex-wrap items-center gap-3 p-4">
                <span className="tabular w-24 text-xl font-extrabold">{h.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{h.name} {overridden.has(`${h.id}|${h.region}`) ? <Badge tone="navy">{t("admin.helplines.overriddenBadge")}</Badge> : null}</span>
                  <span className="block text-sm text-ink-3">{h.purpose}</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => setEditing({ ...h })}>
                  {t("admin.helplines.override")}
                </Button>
              </Panel>
            </li>
          ))}
        </ul>
      </section>

      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent title={editing?.id ? t("admin.helplines.editTitle") : t("admin.helplines.add")}>
          {editing ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setErrors({});
                try {
                  const { updatedAt: _u, ...body } = editing;
                  await api("/api/admin/helplines", { method: "PUT", body: { ...body, priority: Number(body.priority) } });
                  toast.success(t("admin.helplines.saved"));
                  setEditing(null);
                  void reload();
                } catch (err) {
                  const e2 = err as ClientApiError;
                  const fe: Record<string, string> = {};
                  if (Array.isArray(e2.details)) for (const d of e2.details as Array<{ path: string; message: string }>) fe[d.path] ??= d.message;
                  setErrors(fe);
                  if (!Object.keys(fe).length) toast.error(e2.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="h-id" label={t("admin.helplines.id")} hint={t("admin.helplines.idHint")} error={errors.id}>
                  <Input value={editing.id} onChange={(e) => set("id", e.target.value.toLowerCase())} required />
                </Field>
                <Field id="h-number" label={t("admin.helplines.number")} error={errors.number}>
                  <Input value={editing.number} onChange={(e) => set("number", e.target.value)} inputMode="tel" required />
                </Field>
              </div>
              <Field id="h-name" label={t("admin.helplines.name")} error={errors.name}>
                <Input value={editing.name} onChange={(e) => set("name", e.target.value)} required />
              </Field>
              <Field id="h-purpose" label={t("admin.helplines.purpose")} error={errors.purpose}>
                <Textarea value={editing.purpose} onChange={(e) => set("purpose", e.target.value)} required />
              </Field>
              <Field id="h-notes" label={t("admin.helplines.notes")} error={errors.availabilityNotes}>
                <Textarea value={editing.availabilityNotes} onChange={(e) => set("availabilityNotes", e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="h-region" label={t("settings.region")}>
                  <NativeSelect value={editing.region} onChange={(e) => set("region", e.target.value)}>
                    {data.regions.map((r) => (
                      <option key={r.code} value={r.code}>{r.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="h-cat" label={t("admin.helplines.category")}>
                  <NativeSelect value={editing.category} onChange={(e) => set("category", e.target.value as HelplineCategory)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{t(`helplines.category.${c}`)}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="h-prio" label={t("admin.helplines.priority")}>
                  <Input type="number" min={0} max={1000} value={editing.priority} onChange={(e) => set("priority", Number(e.target.value))} />
                </Field>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] p-3 ring-1 ring-inset ring-line">
                <span className="font-semibold">{t("admin.helplines.active")}</span>
                <Switch checked={editing.active} onCheckedChange={(v) => set("active", v)} />
              </label>
              <Button type="submit" size="lg" loading={busy}>
                {t("common.save")}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
