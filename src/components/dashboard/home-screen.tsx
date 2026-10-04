"use client";

import { BatteryFull, BatteryLow, BatteryMedium, ChevronRight, Hospital, LocateFixed, LocateOff, MapPin, Route, Settings, ShieldAlert, Smartphone, Users } from "lucide-react";
import Link from "next/link";
import { CallButton } from "@/components/emergency/call-button";
import { useEmergency } from "@/components/emergency/emergency-provider";
import { SosButton } from "@/components/emergency/sos-button";
import { useAppData } from "@/components/providers/app-data-provider";
import { useLocation } from "@/components/providers/location-provider";
import { Logo } from "@/components/brand/logo";
import { Panel } from "@/components/ui/misc";
import { useBattery } from "@/hooks/use-battery";
import { useOnline } from "@/hooks/use-online";
import { useI18n } from "@/lib/i18n/client";
import { cn, firstName } from "@/lib/utils";
import { CheckInCard } from "./checkin-card";
import { JourneyShortcut } from "./journey-shortcut";

function Chip({ children, tone = "plain", onClick, href }: { children: React.ReactNode; tone?: "plain" | "warn"; onClick?: () => void; href?: string }) {
  const cls = cn(
    "on-dark inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold",
    tone === "warn" ? "bg-warn text-white" : "bg-white/8 text-navy-200",
    (onClick || href) && "hover:bg-white/14",
  );
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{children}</button>;
  return <span className={cls}>{children}</span>;
}

function ProtectionStatus() {
  const { t } = useI18n();
  const { contacts, contactsLoaded } = useAppData();
  const online = useOnline();
  const reachable = contacts.filter((c) => c.phone || c.email).length;
  const state = !online ? "offline" : contactsLoaded && reachable === 0 ? "setup" : "protected";
  return (
    <p className="flex items-center gap-2.5 text-[17px] font-bold text-white" aria-live="polite">
      <span
        className={cn(
          "relative size-3 rounded-full",
          state === "protected" ? "bg-safe-bright" : state === "setup" ? "bg-[#fbbf24]" : "bg-navy-300",
        )}
        aria-hidden
      >
        {state === "protected" ? <span className="absolute inset-0 animate-ping rounded-full bg-safe-bright/60 motion-reduce:hidden" /> : null}
      </span>
      {state === "protected" ? t("home.protected") : state === "setup" ? t("home.setupIncomplete") : t("home.offlineStatus")}
    </p>
  );
}

function LocationChip() {
  const { t } = useI18n();
  const loc = useLocation();
  if (loc.demo) return <Chip><MapPin className="size-4" aria-hidden />{t("home.locationSimulated")}</Chip>;
  if (loc.permission === "denied" || loc.status === "denied") return <Chip tone="warn" href="/app/settings#permissions"><LocateOff className="size-4" aria-hidden />{t("home.locationBlocked")}</Chip>;
  if (loc.permission === "unsupported" || loc.status === "unsupported") return <Chip tone="warn"><LocateOff className="size-4" aria-hidden />{t("home.locationUnsupported")}</Chip>;
  if (loc.fix) return <Chip><LocateFixed className="size-4" aria-hidden />{t("home.locationAvailable")}{loc.fix.accuracy && loc.fix.accuracy > 150 ? ` · ${t("home.lowAccuracy")}` : ""}</Chip>;
  if (loc.permission === "prompt" || loc.permission === "unknown")
    return (
      <Chip onClick={() => void loc.requestFix({ highAccuracy: false })}>
        <MapPin className="size-4" aria-hidden />
        {loc.status === "locating" ? t("home.locating") : t("home.turnOnLocation")}
      </Chip>
    );
  if (loc.status === "unavailable" || loc.status === "timeout") return <Chip tone="warn"><LocateOff className="size-4" aria-hidden />{t("home.locationUnavailable")}</Chip>;
  return <Chip><MapPin className="size-4" aria-hidden />{t("home.locating")}</Chip>;
}

function BatteryChip() {
  const { t, formatNumber } = useI18n();
  const b = useBattery();
  if (!b.supported || b.level == null) return null;
  const Icon = b.level > 0.6 ? BatteryFull : b.level > 0.25 ? BatteryMedium : BatteryLow;
  return (
    <Chip tone={b.level <= 0.15 && !b.charging ? "warn" : "plain"}>
      <Icon className="size-4" aria-hidden />
      <span className="tabular">{formatNumber(b.level, { style: "percent" })}</span>
      <span className="sr-only">{t("home.battery")}</span>
    </Chip>
  );
}

export function HomeScreen() {
  const { t } = useI18n();
  const { user, contacts, contactsLoaded, primary, demo } = useAppData();
  const emergency = useEmergency();
  const primaryContact = contacts.find((c) => c.isPrimary && c.phone) ?? contacts.find((c) => c.phone);
  const noContacts = contactsLoaded && contacts.length === 0;

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[minmax(420px,520px)_1fr]">
      {/* Navy SOS column */}
      <section aria-labelledby="sos-title" className="flex min-h-[calc(100dvh-76px)] flex-col bg-navy-900 px-4 pb-6 pt-safe-4 text-white sm:px-6 lg:sticky lg:top-0 lg:h-dvh lg:min-h-0 lg:px-10 lg:pt-8">
        <div className="flex items-center justify-between">
          <span className="lg:invisible"><Logo onDark /></span>
          <Link href="/app/settings" className="on-dark -mr-2 grid size-12 place-items-center rounded-full hover:bg-white/10 lg:hidden" aria-label={t("nav.settings")}>
            <Settings className="size-[22px]" aria-hidden />
          </Link>
        </div>
        <h1 id="sos-title" className="sr-only">{t("home.title", { name: firstName(user.name) })}</h1>
        <div className="mt-4">
          <ProtectionStatus />
          <div className="mt-3 flex flex-wrap gap-2">
            <LocationChip />
            <BatteryChip />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-6">
          <SosButton
            holdMs={user.preferences.holdDurationMs}
            tripleTapEnabled={user.preferences.tripleTapEnabled}
            onTrigger={(method) => (emergency.provider ? emergency.provider.emit(method) : emergency.trigger(method))}
          />
        </div>

        {noContacts ? (
          <Link href="/app/contacts?add=1" className="on-dark mb-3 flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] bg-warn px-4 py-3 text-white">
            <ShieldAlert className="size-5 shrink-0" aria-hidden />
            <span className="flex-1 text-[15px] font-semibold leading-snug">{t("home.noContactsCta")}</span>
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          <CallButton number={primary.emergency} label={t("home.call", { number: primary.emergency })} emergencyService demo={demo} variant="onDarkSolid" size="lg" />
          {primaryContact?.phone ? (
            <CallButton number={primaryContact.phone} label={firstName(primaryContact.name)} emergencyService={false} demo={demo} variant="onDark" size="lg" className="ring-1 ring-inset ring-white/15" />
          ) : (
            <Link href="/app/contacts?add=1" className="on-dark inline-flex h-14 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-white/10 font-semibold text-white ring-1 ring-inset ring-white/15 hover:bg-white/16">
              <Users className="size-5" aria-hidden />
              {t("home.addContact")}
            </Link>
          )}
        </div>
      </section>

      {/* Calm daily tools */}
      <section aria-label={t("home.toolsLabel")} className="bg-ground px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pt-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <h2 className="hidden text-[28px] font-extrabold tracking-[-0.02em] lg:block">{t("home.greeting", { name: firstName(user.name) })}</h2>
          <CheckInCard />
          <JourneyShortcut />
          <Panel className="p-2">
            <Link href="/app/help?category=police" className="flex min-h-16 items-center gap-3 rounded-[var(--radius-control)] px-3 hover:bg-ground">
              <span className="grid size-11 place-items-center rounded-full bg-navy-900 text-white"><MapPin className="size-5" aria-hidden /></span>
              <span className="flex-1">
                <span className="block font-bold">{t("home.nearbyPolice")}</span>
                <span className="block text-sm text-ink-3">{t("home.nearbyPoliceHint")}</span>
              </span>
              <ChevronRight className="size-5 text-ink-3" aria-hidden />
            </Link>
            <Link href="/app/help?category=hospital" className="flex min-h-16 items-center gap-3 rounded-[var(--radius-control)] px-3 hover:bg-ground">
              <span className="grid size-11 place-items-center rounded-full bg-navy-900 text-white"><Hospital className="size-5" aria-hidden /></span>
              <span className="flex-1">
                <span className="block font-bold">{t("home.nearbyHospitals")}</span>
                <span className="block text-sm text-ink-3">{t("home.nearbyHospitalsHint")}</span>
              </span>
              <ChevronRight className="size-5 text-ink-3" aria-hidden />
            </Link>
            <Link href="/app/journey" className="flex min-h-16 items-center gap-3 rounded-[var(--radius-control)] px-3 hover:bg-ground lg:hidden">
              <span className="grid size-11 place-items-center rounded-full bg-navy-900 text-white"><Route className="size-5" aria-hidden /></span>
              <span className="flex-1">
                <span className="block font-bold">{t("nav.journey")}</span>
                <span className="block text-sm text-ink-3">{t("home.journeyHint")}</span>
              </span>
              <ChevronRight className="size-5 text-ink-3" aria-hidden />
            </Link>
          </Panel>
          <div className="flex gap-3 rounded-[var(--radius-panel)] p-4 text-sm leading-relaxed text-ink-2 ring-1 ring-inset ring-line">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
            <p>{t("home.hardwareNote")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
