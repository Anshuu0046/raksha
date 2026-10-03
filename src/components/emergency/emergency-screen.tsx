"use client";

import { Ambulance, Check, Circle, Link2, Mic, MessageSquareText, Phone, Shield, Square, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data-provider";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useRecorder, type RecorderSegment } from "@/hooks/use-recorder";
import { useI18n } from "@/lib/i18n/client";
import { formatCoords, mapLink } from "@/lib/location/geo";
import { recordingsDb } from "@/lib/offline/recordings-db";
import { cn, firstName } from "@/lib/utils";
import { CancelEmergencyDialog } from "./cancel-dialog";
import { CallButton } from "./call-button";
import { useEmergency } from "./emergency-provider";

type StepState = "done" | "pending" | "failed" | "off";

function Step({ state, label, detail }: { state: StepState; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
          state === "done" && "bg-white text-sos-deep",
          state === "pending" && "bg-white/15 text-white",
          state === "failed" && "bg-navy-950 text-white",
          state === "off" && "bg-white/10 text-sos-tint",
        )}
        aria-hidden
      >
        {state === "done" ? <Check className="size-4" strokeWidth={3} /> : state === "failed" ? <X className="size-4" strokeWidth={3} /> : state === "pending" ? <span className="size-3 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <Circle className="size-3" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[17px] font-bold leading-snug text-white">{label}</span>
        {detail ? <span className="tabular block text-sm text-sos-tint">{detail}</span> : null}
      </span>
    </li>
  );
}

function ActionTile({
  icon: Icon,
  label,
  onClick,
  tone = "light",
  active,
  className,
  sub,
}: {
  icon: typeof Phone;
  label: string;
  onClick?: () => void;
  tone?: "light" | "dark" | "ghost";
  active?: boolean;
  className?: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "on-dark flex min-h-16 items-center justify-center gap-2.5 rounded-[var(--radius-control)] px-3 text-[15px] font-extrabold uppercase tracking-[0.02em] transition-[transform,background-color] active:scale-[0.98]",
        tone === "light" && "bg-white text-sos-deep hover:bg-sos-soft",
        tone === "dark" && "bg-navy-950 text-white hover:bg-navy-900",
        tone === "ghost" && "bg-transparent text-white ring-2 ring-inset ring-white/40 hover:bg-white/10",
        active && "bg-navy-950 text-white ring-0",
        className,
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="flex flex-col items-start leading-tight">
        <span>{label}</span>
        {sub ? <span className="tabular text-xs font-semibold normal-case tracking-normal opacity-80">{sub}</span> : null}
      </span>
    </button>
  );
}

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function EmergencyScreen() {
  const { t, formatTime, formatDateTime } = useI18n();
  const em = useEmergency();
  const { user, contacts, primary, demo } = useAppData();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);

  const local = em.local!;
  const status = em.status;
  const eventId = local.eventId;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Move focus to the heading so screen readers announce the state change immediately.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const uploadSegment = async (segment: RecorderSegment) => {
    if (!user.preferences.uploadRecordings || !eventId || !navigator.onLine) return;
    const form = new FormData();
    form.set("file", segment.blob, `segment.${segment.mimeType.split("/")[1] ?? "webm"}`);
    form.set("eventId", eventId);
    form.set("durationSeconds", String(segment.durationSeconds));
    try {
      const res = await fetch("/api/recordings", { method: "POST", body: form, credentials: "same-origin" });
      if (res.ok) await recordingsDb.markUploaded(segment.id).catch(() => undefined);
    } catch {
      // stays on device; can be uploaded later from History
    }
  };
  const recorder = useRecorder({ eventId, onSegment: (s) => void uploadSegment(s) });

  // Optional auto-start of recording (preference), only once per emergency.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (user.preferences.autoRecordAudio && !autoStarted.current && recorder.supported) {
      autoStarted.current = true;
      void recorder.start();
    }
  }, [recorder, user.preferences.autoRecordAudio]);

  useEffect(() => {
    if (recorder.status === "denied") toast.error(t("emergency.record.denied"));
    if (recorder.status === "unsupported") toast.error(t("emergency.record.unsupported"));
  }, [recorder.status, t]);

  // ---- derived status
  const sos = useMemo(() => (status?.notifications ?? []).filter((n) => n.kind !== "emergency_ended"), [status]);
  const reachedContacts = new Set(sos.filter((n) => n.status === "sent" || n.status === "simulated").map((n) => n.contactId));
  const pendingCount = sos.filter((n) => n.status === "pending").length;
  const failedAll = sos.length > 0 && pendingCount === 0 && reachedContacts.size === 0;
  const notifyState: StepState = !local.serverConfirmed
    ? "pending"
    : contacts.length === 0
      ? "off"
      : reachedContacts.size > 0
        ? "done"
        : failedAll
          ? "failed"
          : "pending";

  const lastFix = em.lastSent?.fix ?? null;
  const serverLoc = status?.latestLocation ?? null;
  const loc = lastFix ?? (serverLoc ? { lat: serverLoc.lat, lng: serverLoc.lng, accuracy: serverLoc.accuracy, recordedAt: serverLoc.recordedAt } : null);
  const locationState: StepState = loc ? (local.serverConfirmed ? "done" : "pending") : "pending";
  const trackingState: StepState = em.trackingActive && loc ? "done" : em.trackingActive ? "pending" : "off";
  const lastUpdated = em.lastSent?.at ?? serverLoc?.recordedAt ?? null;
  const elapsedSec = Math.max(0, Math.floor((now - new Date(local.startedAt).getTime()) / 1000));

  const primaryContact = contacts.find((c) => c.isPrimary && c.phone) ?? contacts.find((c) => c.phone);
  const smsBody = t("emergency.smsFallbackBody", { name: firstName(user.name), link: loc ? mapLink(loc) : t("emergency.locationUnknown") });

  const headline = !local.serverConfirmed
    ? em.online
      ? t("emergency.sending")
      : t("emergency.queuedOffline")
    : notifyState === "done"
      ? t("emergency.contactsNotified")
      : notifyState === "off"
        ? t("emergency.noContacts")
        : notifyState === "failed"
          ? t("emergency.notifyFailed")
          : t("emergency.notifying");

  const share = async () => {
    const url = local.shareUrl ?? (await em.newShareLink());
    if (!url) return toast.error(t("emergency.share.unavailable"));
    const data = { title: t("emergency.share.title"), text: t("emergency.share.text", { name: firstName(user.name) }), url };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t("emergency.share.copied"));
      }
    } catch {
      // user dismissed the share sheet
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="emergency-heading"
      className="fixed inset-0 z-40 flex flex-col bg-sos-deep text-white"
    >
      {/* Scrollable status area */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em] text-sos-tint">
              <span className="size-2.5 animate-beacon rounded-full bg-white" aria-hidden />
              {demo ? t("demo.badge") : "Raksha"}
            </span>
            <span className="tabular text-sm font-semibold text-sos-tint" aria-label={t("emergency.elapsed")}>
              {mmss(elapsedSec)}
            </span>
          </div>

          <h1
            id="emergency-heading"
            ref={headingRef}
            tabIndex={-1}
            className="mt-4 text-[clamp(40px,11vw,64px)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] outline-none"
          >
            {t("emergency.active")}
          </h1>
          <p className="mt-3 max-w-[40ch] text-lg font-semibold leading-snug" aria-live="polite">
            {headline}
          </p>

          {!em.online ? (
            <div role="alert" className="mt-5 rounded-[var(--radius-panel)] bg-navy-950 p-4">
              <p className="font-bold">{t("offline.title")}</p>
              <p className="mt-1 text-sm text-navy-200">{t("emergency.offlineHelp")}</p>
              {primaryContact?.phone ? (
                <a
                  href={`sms:${primaryContact.phone}?body=${encodeURIComponent(smsBody)}`}
                  className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] bg-white px-4 font-bold text-navy-900"
                >
                  <MessageSquareText className="size-5" aria-hidden />
                  {t("emergency.smsFallback", { name: firstName(primaryContact.name) })}
                </a>
              ) : null}
            </div>
          ) : null}
          {em.authError ? (
            <div role="alert" className="mt-4 rounded-[var(--radius-panel)] bg-navy-950 p-4 text-sm">
              {t("emergency.authError")}
            </div>
          ) : null}

          <ul className="mt-6 flex flex-col gap-4">
            <Step
              state={notifyState}
              label={
                notifyState === "off"
                  ? t("emergency.step.noContacts")
                  : t("emergency.step.contacts", { count: reachedContacts.size, total: contacts.length })
              }
              detail={pendingCount > 0 ? t("emergency.step.pending", { count: pendingCount }) : demo ? t("demo.simulatedDelivery") : undefined}
            />
            <Step state={locationState} label={loc ? t("emergency.step.locationShared") : t("emergency.step.locating")} detail={loc ? formatCoords(loc) : t("emergency.locationHelp")} />
            <Step
              state={trackingState}
              label={trackingState === "done" ? t("emergency.step.tracking") : t("emergency.step.trackingStarting")}
              detail={lastUpdated ? t("emergency.lastUpdated", { time: formatTime(lastUpdated) }) : undefined}
            />
          </ul>

          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[var(--radius-panel)] bg-black/15 p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-sos-tint">{t("emergency.triggeredAt")}</dt>
              <dd className="tabular font-bold">{formatDateTime(local.startedAt)}</dd>
            </div>
            <div>
              <dt className="text-sos-tint">{t("emergency.accuracy")}</dt>
              <dd className="tabular font-bold">{loc?.accuracy != null ? `±${Math.round(loc.accuracy)} m` : "—"}</dd>
            </div>
            <div>
              <dt className="text-sos-tint">{t("emergency.liveStatus")}</dt>
              <dd className="font-bold">{em.trackingActive ? t("emergency.live") : t("emergency.notLive")}</dd>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <dt className="text-sos-tint">{t("emergency.address")}</dt>
              <dd className="font-bold">{status?.event.address ?? (loc ? t("emergency.addressPending") : "—")}</dd>
            </div>
            <div>
              <dt className="text-sos-tint">{t("emergency.eventId")}</dt>
              <dd className="tabular font-bold">{eventId ? eventId.slice(0, 8).toUpperCase() : t("emergency.notSentYet")}</dd>
            </div>
          </dl>
          {em.queued > 0 ? <p className="mt-3 text-sm text-sos-tint">{t("emergency.queued", { count: em.queued })}</p> : null}
        </div>
      </div>

      {/* Pinned actions: always visible, reachable with one thumb */}
      <div className="border-t border-white/15 bg-sos-deep px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-2.5 sm:grid-cols-3">
          <CallButton
            number={primary.police}
            label={t("emergency.callPolice")}
            emergencyService
            demo={demo}
            className="on-dark min-h-16 bg-white text-[15px] font-extrabold uppercase text-sos-deep hover:bg-sos-soft"
            size="xl"
          />
          <CallButton
            number={primary.ambulance}
            label={t("emergency.callAmbulance")}
            emergencyService
            demo={demo}
            className="on-dark min-h-16 bg-white text-[15px] font-extrabold uppercase text-sos-deep hover:bg-sos-soft"
            size="xl"
            icon={<Ambulance aria-hidden />}
          />
          <ActionTile icon={Users} label={t("emergency.callContact")} tone="dark" onClick={() => setContactsOpen(true)} />
          <ActionTile icon={Link2} label={t("emergency.shareLocation")} tone="dark" onClick={share} />
          <ActionTile
            icon={recorder.status === "recording" ? Square : Mic}
            label={recorder.status === "recording" ? t("emergency.record.stop") : t("emergency.record.start")}
            sub={recorder.status === "recording" ? mmss(recorder.elapsed) : recorder.segments > 0 ? t("emergency.record.saved", { count: recorder.segments }) : undefined}
            tone="dark"
            active={recorder.status === "recording"}
            onClick={() => (recorder.status === "recording" ? recorder.stop() : void recorder.start())}
          />
          <ActionTile icon={Shield} label={t("emergency.cancelAction")} tone="ghost" onClick={() => setCancelOpen(true)} />
        </div>
        {recorder.status === "recording" ? (
          <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-sos-tint" aria-live="polite">
            <span className="mr-1.5 inline-block size-2 animate-beacon rounded-full bg-white align-middle" aria-hidden />
            {user.preferences.uploadRecordings ? t("emergency.record.uploading") : t("emergency.record.deviceOnly")}
          </p>
        ) : null}
      </div>

      <Dialog open={contactsOpen} onOpenChange={setContactsOpen}>
        <DialogContent title={t("emergency.contactsSheet.title")} description={t("emergency.contactsSheet.description")}>
          {contacts.filter((c) => c.phone).length === 0 ? (
            <p className="text-ink-2">{t("emergency.contactsSheet.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {contacts
                .filter((c) => c.phone)
                .map((c) => (
                  <li key={c.id}>
                    <CallButton
                      number={c.phone!}
                      label={c.name}
                      sublabel={`${t(`relationship.${c.relationship}`)}${c.isPrimary ? ` · ${t("contacts.primary")}` : ""}`}
                      emergencyService={false}
                      demo={demo}
                      variant={c.isPrimary ? "sos" : "default"}
                      block
                    />
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <CallButton number={primary.emergency} label={`${t("helplines.call")} ${primary.emergency}`} emergencyService demo={demo} variant="outline" />
            <CallButton number="181" label={`${t("helplines.call")} 181`} emergencyService demo={demo} variant="outline" icon={false} />
          </div>
        </DialogContent>
      </Dialog>

      <CancelEmergencyDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={async (reason) => {
          recorder.stop();
          await em.cancel(reason);
        }}
      />
    </div>
  );
}
