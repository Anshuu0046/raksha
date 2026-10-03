"use client";

import { Bell, Camera, Check, ChevronLeft, MapPin, Mic, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { ContactForm } from "@/components/contacts/contact-form";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/misc";
import { SwitchRow } from "@/components/ui/switch";
import { requestMicrophone, usePermission, type PermissionValue } from "@/hooks/use-permission";
import { api, ClientApiError } from "@/lib/api/client";
import type { ContactView } from "@/lib/contacts/service";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";
import { subscribeToPush } from "@/lib/push/client";
import { cn } from "@/lib/utils";
import type { PublicUser, UserPreferences } from "@/types";
import { SUPPORTED_REGIONS } from "@/config/emergencyNumbers";

const STEPS = ["profile", "contacts", "permissions", "preferences"] as const;
type Step = (typeof STEPS)[number];

async function resizeImage(file: File, size = 160): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function PermissionRow({
  icon: Icon,
  title,
  why,
  state,
  onAllow,
  optional,
}: {
  icon: typeof MapPin;
  title: string;
  why: string;
  state: PermissionValue;
  onAllow: () => Promise<void>;
  optional?: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-navy-900 text-white">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="flex-1">
        <p className="flex flex-wrap items-center gap-2 font-bold">
          {title}
          {optional ? <span className="text-sm font-normal text-ink-3">{optional}</span> : null}
        </p>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{why}</p>
        {state === "denied" ? <p className="mt-2 text-sm font-medium text-sos-ink">{t("onboarding.permissions.blocked")}</p> : null}
        {state === "unsupported" ? <p className="mt-2 text-sm text-ink-3">{t("onboarding.permissions.unsupported")}</p> : null}
      </div>
      <div className="sm:pt-1">
        {state === "granted" ? (
          <Badge tone="safe">
            <Check className="size-3.5" aria-hidden />
            {t("onboarding.permissions.allowed")}
          </Badge>
        ) : state === "unsupported" || state === "denied" ? null : (
          <Button
            variant="outline"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onAllow();
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("onboarding.permissions.allow")}
          </Button>
        )}
      </div>
    </li>
  );
}

export function OnboardingFlow({ user: initialUser, demo }: { user: PublicUser; demo: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<Step>("profile");
  const [user, setUser] = useState(initialUser);
  const [name, setName] = useState(initialUser.name);
  const [phone, setPhone] = useState(initialUser.phone ?? "");
  const [lang, setLang] = useState(initialUser.locale || locale);
  const [avatar, setAvatar] = useState<string | null>(initialUser.avatarUrl);
  const [prefs, setPrefs] = useState<UserPreferences>(initialUser.preferences);
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [adding, setAdding] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const geo = usePermission("geolocation");
  const notif = usePermission("notifications");
  const mic = usePermission("microphone");

  useEffect(() => {
    void api<{ contacts: ContactView[] }>("/api/contacts")
      .then((r) => {
        setContacts(r.contacts);
        setAdding(r.contacts.length === 0);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => headingRef.current?.focus(), [step]);

  const index = STEPS.indexOf(step);
  const go = (s: Step) => setStep(s);

  const saveProfile = async () => {
    setBusy(true);
    setErrors({});
    try {
      const res = await api<{ user: PublicUser }>("/api/me", {
        method: "PATCH",
        body: { name, phone: phone.trim() || null, locale: lang, avatarUrl: avatar },
      });
      setUser(res.user);
      if (lang !== locale) {
        document.cookie = `raksha_locale=${lang}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }
      go("contacts");
    } catch (err) {
      const e = err as ClientApiError;
      const fe: Record<string, string> = {};
      if (Array.isArray(e.details)) for (const d of e.details as Array<{ path: string; message: string }>) fe[d.path] ??= d.message;
      setErrors(Object.keys(fe).length ? fe : { form: e.message });
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await api("/api/me", { method: "PATCH", body: { preferences: prefs, onboarded: true } });
      router.replace("/app");
      router.refresh();
    } catch (err) {
      toast.error((err as ClientApiError).message);
      setBusy(false);
    }
  };

  const titles: Record<Step, { title: string; description: string; icon: typeof UserRound }> = {
    profile: { title: t("onboarding.profile.title"), description: t("onboarding.profile.description"), icon: UserRound },
    contacts: { title: t("onboarding.contacts.title"), description: t("onboarding.contacts.description"), icon: Users },
    permissions: { title: t("onboarding.permissions.title"), description: t("onboarding.permissions.description"), icon: MapPin },
    preferences: { title: t("onboarding.preferences.title"), description: t("onboarding.preferences.description"), icon: Bell },
  };

  return (
    <div className="min-h-dvh bg-ground">
      <header className="bg-navy-900 px-4 pb-6 pt-4 text-white sm:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo onDark />
          <span className="tabular text-sm font-semibold text-navy-300">{t("onboarding.stepOf", { step: index + 1, total: STEPS.length })}</span>
        </div>
        <ol className="mx-auto mt-5 grid max-w-2xl grid-cols-4 gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <li key={s} className={cn("h-1.5 rounded-full", i <= index ? "bg-white" : "bg-white/15")} />
          ))}
        </ol>
      </header>

      <main id="main" className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-8">
        <h1 ref={headingRef} tabIndex={-1} className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] outline-none">
          {titles[step].title}
        </h1>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{titles[step].description}</p>

        <div className="mt-8">
          {step === "profile" ? (
            <div className="flex flex-col gap-5">
              {errors.form ? <Notice tone="error" title={errors.form} /> : null}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-navy-900 text-white"
                  aria-label={t("onboarding.profile.photo")}
                >
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="size-full object-cover" />
                  ) : (
                    <Camera className="size-6" aria-hidden />
                  )}
                </button>
                <div>
                  <p className="font-bold">{t("onboarding.profile.photo")}</p>
                  <p className="text-sm text-ink-3">{t("onboarding.profile.photoHint")}</p>
                  {avatar ? (
                    <button type="button" className="mt-1 text-sm font-semibold underline" onClick={() => setAvatar(null)}>
                      {t("common.remove")}
                    </button>
                  ) : null}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setAvatar(await resizeImage(file).catch(() => null));
                  }}
                />
              </div>
              <Field id="ob-name" label={t("onboarding.profile.name")} error={errors.name}>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </Field>
              <Field id="ob-phone" label={t("onboarding.profile.phone")} hint={t("onboarding.profile.phoneHint")} error={errors.phone}>
                <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="98765 43210" />
              </Field>
              <Field id="ob-lang" label={t("settings.language")}>
                <NativeSelect value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
                  {LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {LOCALE_NAMES[l].native} · {LOCALE_NAMES[l].english}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Button size="lg" block loading={busy} onClick={saveProfile}>
                {t("common.continue")}
              </Button>
            </div>
          ) : null}

          {step === "contacts" ? (
            <div className="flex flex-col gap-5">
              {contacts.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 rounded-[var(--radius-control)] bg-surface p-4 ring-1 ring-inset ring-line">
                      <span className="grid size-10 place-items-center rounded-full bg-safe-soft text-safe-ink">
                        <Check className="size-5" aria-hidden />
                      </span>
                      <span className="flex-1">
                        <span className="block font-bold">{c.name}</span>
                        <span className="block text-sm text-ink-3">
                          {t(`relationship.${c.relationship}`)}
                          {c.isPrimary ? ` · ${t("contacts.primary")}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {adding ? (
                <div className="rounded-[var(--radius-panel)] bg-surface p-5 ring-1 ring-inset ring-line">
                  <ContactForm
                    onSaved={(c) => {
                      setContacts((list) => [...list.map((x) => (c.isPrimary ? { ...x, isPrimary: false } : x)), c]);
                      setAdding(false);
                      toast.success(t("contacts.added", { name: c.name }));
                    }}
                    onCancel={contacts.length > 0 ? () => setAdding(false) : undefined}
                  />
                </div>
              ) : (
                <Button variant="outline" size="lg" onClick={() => setAdding(true)}>
                  {t("contacts.addAnother")}
                </Button>
              )}
              {contacts.length === 0 ? <Notice tone="warn" title={t("onboarding.contacts.skipWarning")} /> : null}
              <div className="flex gap-2.5">
                <Button variant="ghost" size="lg" onClick={() => go("profile")} aria-label={t("common.back")}>
                  <ChevronLeft aria-hidden />
                </Button>
                <Button size="lg" className="flex-1" onClick={() => go("permissions")}>
                  {contacts.length === 0 ? t("onboarding.skipForNow") : t("common.continue")}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "permissions" ? (
            <div className="flex flex-col gap-5">
              {demo ? <Notice tone="warn" title={t("demo.permissionsNote")} /> : null}
              <ul className="divide-y divide-line rounded-[var(--radius-panel)] bg-surface px-5 ring-1 ring-inset ring-line">
                <PermissionRow
                  icon={MapPin}
                  title={t("onboarding.permissions.location")}
                  why={t("onboarding.permissions.locationWhy")}
                  state={geo.state}
                  onAllow={() =>
                    new Promise<void>((resolve) =>
                      navigator.geolocation.getCurrentPosition(
                        () => void geo.refresh().then(resolve),
                        () => void geo.refresh().then(resolve),
                        { timeout: 15_000 },
                      ),
                    )
                  }
                />
                <PermissionRow
                  icon={Bell}
                  title={t("onboarding.permissions.notifications")}
                  why={t("onboarding.permissions.notificationsWhy")}
                  state={notif.state}
                  onAllow={async () => {
                    const r = await subscribeToPush("/api/push/subscribe");
                    if (r !== "subscribed" && r !== "denied") toast.message(t(`push.${r}`));
                    await notif.refresh();
                  }}
                />
                <PermissionRow
                  icon={Mic}
                  title={t("onboarding.permissions.microphone")}
                  why={t("onboarding.permissions.microphoneWhy")}
                  optional={t("common.optional")}
                  state={mic.state}
                  onAllow={async () => {
                    await requestMicrophone();
                    await mic.refresh();
                  }}
                />
              </ul>
              <p className="text-sm leading-relaxed text-ink-3">{t("onboarding.permissions.cameraNote")}</p>
              <div className="flex gap-2.5">
                <Button variant="ghost" size="lg" onClick={() => go("contacts")} aria-label={t("common.back")}>
                  <ChevronLeft aria-hidden />
                </Button>
                <Button size="lg" className="flex-1" onClick={() => go("preferences")}>
                  {t("common.continue")}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "preferences" ? (
            <div className="flex flex-col gap-5">
              <fieldset>
                <legend className="mb-2 font-bold">{t("settings.holdDuration")}</legend>
                <div className="grid grid-cols-3 gap-2">
                  {[1500, 2000, 3000].map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      aria-pressed={prefs.holdDurationMs === ms}
                      onClick={() => setPrefs((p) => ({ ...p, holdDurationMs: ms }))}
                      className={cn(
                        "tabular h-12 rounded-[var(--radius-control)] font-bold ring-1 ring-inset",
                        prefs.holdDurationMs === ms ? "bg-navy-900 text-white ring-navy-900" : "bg-surface ring-line-strong",
                      )}
                    >
                      {t("settings.seconds", { count: ms / 1000 })}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="divide-y divide-line rounded-[var(--radius-panel)] bg-surface px-5 ring-1 ring-inset ring-line">
                <SwitchRow id="pref-tap" label={t("settings.tripleTap")} description={t("settings.tripleTapHint")} checked={prefs.tripleTapEnabled} onCheckedChange={(v) => setPrefs((p) => ({ ...p, tripleTapEnabled: v }))} />
                <SwitchRow id="pref-rec" label={t("settings.autoRecord")} description={t("settings.autoRecordHint")} checked={prefs.autoRecordAudio} onCheckedChange={(v) => setPrefs((p) => ({ ...p, autoRecordAudio: v }))} />
                <SwitchRow id="pref-upload" label={t("settings.uploadRecordings")} description={t("settings.uploadRecordingsHint")} checked={prefs.uploadRecordings} onCheckedChange={(v) => setPrefs((p) => ({ ...p, uploadRecordings: v }))} />
              </div>
              <Field id="pref-region" label={t("settings.region")} hint={t("settings.regionHint")}>
                <NativeSelect value={prefs.region} onChange={(e) => setPrefs((p) => ({ ...p, region: e.target.value }))}>
                  {SUPPORTED_REGIONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div className="flex gap-2.5">
                <Button variant="ghost" size="lg" onClick={() => go("permissions")} aria-label={t("common.back")}>
                  <ChevronLeft aria-hidden />
                </Button>
                <Button size="lg" variant="sos" className="flex-1" loading={busy} onClick={finish}>
                  {t("onboarding.finish")}
                </Button>
              </div>
              <p className="text-center text-sm text-ink-3">{t("onboarding.hello", { name: user.name.split(" ")[0] })}</p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
