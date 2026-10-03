"use client";

import { Bell, Download, LogOut, MapPin, Mic, Smartphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useEmergency } from "@/components/emergency/emergency-provider";
import { useAppData } from "@/components/providers/app-data-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { Badge, Notice, PageHeader, Panel } from "@/components/ui/misc";
import { SwitchRow } from "@/components/ui/switch";
import { SUPPORTED_REGIONS } from "@/config/emergencyNumbers";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { requestMicrophone, usePermission, type PermissionValue } from "@/hooks/use-permission";
import { api, ClientApiError } from "@/lib/api/client";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";
import { currentSubscription, pushSupport, subscribeToPush, type PushSupport } from "@/lib/push/client";
import type { PublicUser, UserPreferences } from "@/types";

/** Removes account data cached on this device (service-worker pages, offline contacts). */
function clearDeviceData(everything: boolean) {
  try {
    navigator.serviceWorker?.controller?.postMessage("raksha:clear-cache");
    if (everything) localStorage.clear();
    else ["raksha.contacts.v1", "raksha.emergency.v1", "raksha.outbox.v1", "raksha.lastFix.v1"].forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage unavailable
  }
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <h2 id={`${id}-title`} className="text-xl font-extrabold tracking-[-0.01em]">{title}</h2>
      {description ? <p className="mt-1 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{description}</p> : null}
      <Panel className="mt-4 p-5">{children}</Panel>
    </section>
  );
}

function PermissionStatus({ state }: { state: PermissionValue }) {
  const { t } = useI18n();
  if (state === "granted") return <Badge tone="safe">{t("settings.permission.granted")}</Badge>;
  if (state === "denied") return <Badge tone="sos">{t("settings.permission.denied")}</Badge>;
  if (state === "unsupported") return <Badge>{t("settings.permission.unsupported")}</Badge>;
  return <Badge tone="warn">{t("settings.permission.notAsked")}</Badge>;
}

export function SettingsView() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { user, setUser } = useAppData();
  const { provider } = useEmergency();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const geo = usePermission("geolocation");
  const notif = usePermission("notifications");
  const mic = usePermission("microphone");
  const install = useInstallPrompt();
  const caps = provider?.capabilities();

  useEffect(() => {
    // Browser capability checks must run after mount to avoid hydration mismatches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(pushSupport());
    void currentSubscription().then((s) => setPushOn(Boolean(s)));
  }, []);

  const savePrefs = async (patch: Partial<UserPreferences>) => {
    const previous = user;
    setUser({ ...user, preferences: { ...user.preferences, ...patch } });
    try {
      const res = await api<{ user: PublicUser }>("/api/me", { method: "PATCH", body: { preferences: patch } });
      setUser(res.user);
      if (patch.region) router.refresh();
    } catch (err) {
      setUser(previous);
      toast.error((err as ClientApiError).message);
    }
  };

  const setLanguage = async (l: string) => {
    try {
      await api("/api/me", { method: "PATCH", body: { locale: l } });
      document.cookie = `raksha_locale=${l}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    } catch (err) {
      toast.error((err as ClientApiError).message);
    }
  };

  const p = user.preferences;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("settings.title")} />
      <div className="flex flex-col gap-10">
        <Section id="profile" title={t("settings.profile")}>
          <form
            className="flex flex-col gap-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setSavingProfile(true);
              setProfileErrors({});
              try {
                const res = await api<{ user: PublicUser }>("/api/me", { method: "PATCH", body: { name, phone: phone.trim() || null } });
                setUser(res.user);
                toast.success(t("settings.saved"));
              } catch (err) {
                const e2 = err as ClientApiError;
                const fe: Record<string, string> = {};
                if (Array.isArray(e2.details)) for (const d of e2.details as Array<{ path: string; message: string }>) fe[d.path] ??= d.message;
                setProfileErrors(fe);
                if (!Object.keys(fe).length) toast.error(e2.message);
              } finally {
                setSavingProfile(false);
              }
            }}
          >
            <Field id="s-name" label={t("onboarding.profile.name")} error={profileErrors.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field id="s-phone" label={t("onboarding.profile.phone")} hint={t("onboarding.profile.phoneHint")} error={profileErrors.phone}>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </Field>
            {user.email ? <p className="text-sm text-ink-3">{t("settings.signedInAs", { email: user.email })}</p> : null}
            <Button type="submit" loading={savingProfile} className="self-start">
              {t("common.save")}
            </Button>
          </form>
        </Section>

        <Section id="language" title={t("settings.language")} description={t("settings.languageHint")}>
          <Field id="s-lang" label={t("settings.language")}>
            <NativeSelect value={locale} onChange={(e) => void setLanguage(e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l].native} · {LOCALE_NAMES[l].english}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {locale !== "en" ? <p className="mt-3 text-sm text-ink-3">{t("settings.translationNote")}</p> : null}
        </Section>

        <Section id="preferences" title={t("settings.emergencyPrefs")} description={t("settings.emergencyPrefsHint")}>
          <fieldset>
            <legend className="mb-2 font-semibold">{t("settings.holdDuration")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {[1500, 2000, 3000].map((ms) => (
                <Button key={ms} variant={p.holdDurationMs === ms ? "default" : "outline"} aria-pressed={p.holdDurationMs === ms} onClick={() => void savePrefs({ holdDurationMs: ms })}>
                  {t("settings.seconds", { count: ms / 1000 })}
                </Button>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 divide-y divide-line">
            <SwitchRow id="s-tap" label={t("settings.tripleTap")} description={t("settings.tripleTapHint")} checked={p.tripleTapEnabled} onCheckedChange={(v) => void savePrefs({ tripleTapEnabled: v })} />
            <SwitchRow id="s-rec" label={t("settings.autoRecord")} description={t("settings.autoRecordHint")} checked={p.autoRecordAudio} onCheckedChange={(v) => void savePrefs({ autoRecordAudio: v })} />
            <SwitchRow id="s-upload" label={t("settings.uploadRecordings")} description={t("settings.uploadRecordingsHint")} checked={p.uploadRecordings} onCheckedChange={(v) => void savePrefs({ uploadRecordings: v })} />
            <SwitchRow id="s-esc-loc" label={t("settings.shareOnEscalation")} description={t("settings.shareOnEscalationHint")} checked={p.shareLocationOnEscalation} onCheckedChange={(v) => void savePrefs({ shareLocationOnEscalation: v })} />
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <Field id="s-grace" label={t("settings.checkInGrace")} hint={t("settings.checkInGraceHint")}>
              <NativeSelect value={p.checkInGraceMinutes} onChange={(e) => void savePrefs({ checkInGraceMinutes: Number(e.target.value) })}>
                {[5, 10, 15, 30].map((m) => (
                  <option key={m} value={m}>
                    {t("checkin.minutesShort", { count: m })}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="s-region" label={t("settings.region")} hint={t("settings.regionHint")}>
              <NativeSelect value={p.region} onChange={(e) => void savePrefs({ region: e.target.value })}>
                {SUPPORTED_REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </Section>

        <Section id="permissions" title={t("settings.permissions")} description={t("settings.permissionsHint")}>
          <ul className="divide-y divide-line">
            {[
              { icon: MapPin, label: t("onboarding.permissions.location"), why: t("onboarding.permissions.locationWhy"), state: geo.state, ask: () => navigator.geolocation.getCurrentPosition(() => void geo.refresh(), () => void geo.refresh()) },
              { icon: Bell, label: t("onboarding.permissions.notifications"), why: t("onboarding.permissions.notificationsWhy"), state: notif.state, ask: async () => { await subscribeToPush("/api/push/subscribe"); await notif.refresh(); setPushOn(Boolean(await currentSubscription())); } },
              { icon: Mic, label: t("onboarding.permissions.microphone"), why: t("onboarding.permissions.microphoneWhy"), state: mic.state, ask: async () => { await requestMicrophone(); await mic.refresh(); } },
            ].map((row) => (
              <li key={row.label} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <row.icon className="size-5 shrink-0 text-ink-3" aria-hidden />
                <div className="flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {row.label} <PermissionStatus state={row.state} />
                  </p>
                  <p className="text-sm text-ink-3">{row.why}</p>
                  {row.state === "denied" ? <p className="mt-1 text-sm font-medium text-sos-ink">{t("onboarding.permissions.blocked")}</p> : null}
                </div>
                {row.state === "prompt" || row.state === "unknown" ? (
                  <Button variant="outline" size="sm" onClick={() => void row.ask()}>
                    {t("onboarding.permissions.allow")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="notifications" title={t("settings.notifications")} description={t("settings.notificationsHint")}>
          {support === null ? null : support === "ios-needs-install" ? (
            <Notice tone="info" title={t("push.ios-needs-install")} />
          ) : support === "unsupported" ? (
            <Notice tone="warn" title={t("push.unsupported")} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">{pushOn ? t("settings.pushOn") : t("settings.pushOff")}</p>
              {!pushOn ? (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const r = await subscribeToPush("/api/push/subscribe");
                    if (r === "subscribed") {
                      setPushOn(true);
                      toast.success(t("push.enabled"));
                    } else toast.error(t(`push.${r}`));
                  }}
                >
                  <Bell aria-hidden />
                  {t("settings.enablePush")}
                </Button>
              ) : null}
            </div>
          )}
        </Section>

        <Section id="device" title={t("settings.deviceTitle")} description={t("settings.deviceHint")}>
          <div className="flex flex-col gap-4">
            {install.installed ? (
              <Notice tone="success" title={t("settings.installed")} />
            ) : install.canInstall ? (
              <Button variant="outline" className="self-start" onClick={() => void install.install()}>
                <Download aria-hidden />
                {t("settings.install")}
              </Button>
            ) : (
              <p className="text-[15px] text-ink-2">{install.ios ? t("settings.installIos") : t("settings.installOther")}</p>
            )}
            <div className="flex gap-3 rounded-[var(--radius-control)] bg-ground p-4">
              <Smartphone className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
              <div className="text-[15px] leading-relaxed">
                <p className="font-bold">{t("settings.hardwareTitle")}</p>
                <p className="mt-1 text-ink-2">{t("settings.hardwareBody")}</p>
                <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                  <li><Badge tone={caps?.hardwareVolume ? "safe" : "neutral"}>{t("settings.cap.volume")}: {caps?.hardwareVolume ? t("settings.cap.on") : t("settings.cap.androidOnly")}</Badge></li>
                  <li><Badge tone={caps?.hardwarePower ? "safe" : "neutral"}>{t("settings.cap.power")}: {caps?.hardwarePower ? t("settings.cap.on") : t("settings.cap.androidOnly")}</Badge></li>
                  <li><Badge tone={caps?.lockScreen ? "safe" : "neutral"}>{t("settings.cap.lockScreen")}: {caps?.lockScreen ? t("settings.cap.on") : t("settings.cap.androidOnly")}</Badge></li>
                </ul>
              </div>
            </div>
          </div>
        </Section>

        <Section id="privacy" title={t("settings.privacy")}>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed text-ink-2">
            <li>{t("settings.privacy1")}</li>
            <li>{t("settings.privacy2")}</li>
            <li>{t("settings.privacy3")}</li>
            <li>{t("settings.privacy4")}</li>
          </ul>
        </Section>

        <Section id="account" title={t("settings.account")}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              size="lg"
              onClick={async () => {
                await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
                clearDeviceData(false);
                router.replace("/login");
                router.refresh();
              }}
            >
              <LogOut aria-hidden />
              {t("settings.signOut")}
            </Button>
            <Button variant="danger" size="lg" onClick={() => setDeleteOpen(true)}>
              <Trash2 aria-hidden />
              {t("settings.deleteAccount")}
            </Button>
          </div>
        </Section>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent title={t("settings.deleteTitle")} description={t("settings.deleteBody")} tone="danger">
          <Field id="del-confirm" label={t("settings.deleteConfirmLabel")}>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </Field>
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="lg" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              size="lg"
              disabled={confirmText !== "DELETE"}
              onClick={async () => {
                try {
                  await api("/api/me", { method: "DELETE", body: { confirm: "DELETE" } });
                  clearDeviceData(true);
                  router.replace("/");
                  router.refresh();
                } catch (err) {
                  toast.error((err as ClientApiError).message);
                }
              }}
            >
              {t("settings.deleteForever")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
