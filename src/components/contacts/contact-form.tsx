"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { SwitchRow } from "@/components/ui/switch";
import { api, ClientApiError } from "@/lib/api/client";
import type { ContactView } from "@/lib/contacts/service";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";
import { RELATIONSHIPS, type Relationship } from "@/types";

interface FormState {
  name: string;
  phone: string;
  email: string;
  relationship: Relationship;
  customRelationship: string;
  locale: string;
  notifySms: boolean;
  notifyEmail: boolean;
  notifyPush: boolean;
  isPrimary: boolean;
}

export function ContactForm({
  contact,
  onSaved,
  onCancel,
  submitLabel,
}: {
  contact?: ContactView;
  onSaved: (c: ContactView) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const { t, locale } = useI18n();
  const [form, setForm] = useState<FormState>({
    name: contact?.name ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    relationship: contact?.relationship ?? "mother",
    customRelationship: contact?.customRelationship ?? "",
    locale: contact?.locale ?? locale,
    notifySms: contact?.notifySms ?? true,
    notifyEmail: contact?.notifyEmail ?? true,
    notifyPush: contact?.notifyPush ?? true,
    isPrimary: contact?.isPrimary ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const id = contact?.id ?? "new";

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErrors({});
        setError(null);
        const body = {
          name: form.name,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          relationship: form.relationship,
          customRelationship: form.relationship === "custom" ? form.customRelationship.trim() || null : null,
          locale: form.locale,
          notifySms: form.notifySms,
          notifyEmail: form.notifyEmail,
          notifyPush: form.notifyPush,
          isPrimary: form.isPrimary,
        };
        try {
          const { contact: saved } = contact
            ? await api<{ contact: ContactView }>(`/api/contacts/${contact.id}`, { method: "PATCH", body })
            : await api<{ contact: ContactView }>("/api/contacts", { body });
          onSaved(saved);
        } catch (err) {
          const e2 = err as ClientApiError;
          const fe: Record<string, string> = {};
          if (Array.isArray(e2.details)) for (const d of e2.details as Array<{ path: string; message: string }>) fe[d.path] ??= d.message;
          setErrors(fe);
          if (!Object.keys(fe).length) setError(e2.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {error ? <Notice tone="error" title={error} /> : null}
      <Field id={`${id}-name`} label={t("contacts.form.name")} error={errors.name}>
        <Input autoComplete="off" value={form.name} onChange={(e) => set("name", e.target.value)} required />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${id}-relationship`} label={t("contacts.form.relationship")}>
          <NativeSelect value={form.relationship} onChange={(e) => set("relationship", e.target.value as Relationship)}>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {t(`relationship.${r}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {form.relationship === "custom" ? (
          <Field id={`${id}-custom`} label={t("contacts.form.customRelationship")}>
            <Input value={form.customRelationship} maxLength={40} onChange={(e) => set("customRelationship", e.target.value)} />
          </Field>
        ) : (
          <Field id={`${id}-locale`} label={t("contacts.form.language")} hint={t("contacts.form.languageHint")}>
            <NativeSelect value={form.locale} onChange={(e) => set("locale", e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l].native}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>
      <Field id={`${id}-phone`} label={t("contacts.form.phone")} hint={t("contacts.form.phoneHint")} error={errors.phone}>
        <Input type="tel" inputMode="tel" autoComplete="off" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" />
      </Field>
      <Field id={`${id}-email`} label={t("contacts.form.email")} optional={t("common.optional")} error={errors.email}>
        <Input type="email" inputMode="email" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </Field>

      <fieldset className="rounded-[var(--radius-control)] px-4 ring-1 ring-inset ring-line">
        <legend className="px-1 text-sm font-semibold text-ink-2">{t("contacts.form.howToReach")}</legend>
        <div className="divide-y divide-line">
          <SwitchRow id={`${id}-sms`} label={t("contacts.form.sms")} description={t("contacts.form.smsHint")} checked={form.notifySms} onCheckedChange={(v) => set("notifySms", v)} />
          <SwitchRow id={`${id}-emailn`} label={t("contacts.form.emailAlerts")} checked={form.notifyEmail} onCheckedChange={(v) => set("notifyEmail", v)} />
          <SwitchRow id={`${id}-push`} label={t("contacts.form.push")} description={t("contacts.form.pushHint")} checked={form.notifyPush} onCheckedChange={(v) => set("notifyPush", v)} />
          <SwitchRow id={`${id}-primary`} label={t("contacts.form.primary")} description={t("contacts.form.primaryHint")} checked={form.isPrimary} onCheckedChange={(v) => set("isPrimary", v)} />
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        ) : null}
        <Button type="submit" size="lg" loading={busy}>
          {submitLabel ?? (contact ? t("contacts.form.save") : t("contacts.form.add"))}
        </Button>
      </div>
    </form>
  );
}
