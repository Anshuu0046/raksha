"use client";

import { AlarmClock, BellRing, Check, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "@/components/providers/location-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/misc";
import { useApi } from "@/hooks/use-api";
import { api, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/client";
import { currentSubscription, pushSupport, showLocalNotification, subscribeToPush } from "@/lib/push/client";
import { cn } from "@/lib/utils";
import type { CheckIn } from "@/types";

const PRESETS = [15, 30, 60, 120];

function useClockOffset(serverTime: string | undefined) {
  // Server time keeps the countdown honest even when the phone clock is wrong.
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (serverTime) setOffset(new Date(serverTime).getTime() - Date.now());
  }, [serverTime]);
  return offset;
}

function fmt(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function CheckInCard({ className }: { className?: string }) {
  const { t, formatTime } = useI18n();
  const location = useLocation();
  const { data, reload, mutate } = useApi<{ checkIn: CheckIn | null; serverTime: string }>("/api/checkin", { refreshMs: 30_000 });
  const offset = useClockOffset(data?.serverTime);
  const [minutes, setMinutes] = useState(30);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pushReady, setPushReady] = useState<boolean | null>(null);
  const notified = useRef<string | null>(null);

  const checkIn = data?.checkIn ?? null;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void currentSubscription().then((s) => setPushReady(Boolean(s)));
  }, []);

  const remaining = checkIn ? new Date(checkIn.dueAt).getTime() - (now + offset) : 0;
  const overdue = checkIn?.status === "active" && remaining <= 0;
  const escalateAt = checkIn ? new Date(checkIn.dueAt).getTime() + checkIn.graceMinutes * 60_000 : 0;

  // Local reminder when the timer runs out with the app open (push covers the closed case).
  useEffect(() => {
    if (overdue && checkIn && notified.current !== checkIn.id) {
      notified.current = checkIn.id;
      try {
        navigator.vibrate?.([200, 100, 200, 100, 200]);
      } catch {
        // unsupported
      }
      void showLocalNotification(t("checkin.reminderTitle"), t("checkin.reminderBody", { minutes: checkIn.graceMinutes }));
      void reload();
    }
  }, [overdue, checkIn, reload, t]);

  const act = useCallback(
    async (key: string, fn: () => Promise<{ checkIn: CheckIn | null; serverTime: string }>) => {
      setBusy(key);
      try {
        const res = await fn();
        mutate(() => res);
        return res;
      } catch (err) {
        toast.error((err as ClientApiError).message);
      } finally {
        setBusy(null);
      }
    },
    [mutate],
  );

  const start = async (mins: number) => {
    if (!Number.isFinite(mins) || mins < 1 || mins > 1440) return toast.error(t("checkin.invalidDuration"));
    const fix = location.fix ?? location.lastKnown;
    const res = await act("start", () =>
      api("/api/checkin", { body: { minutes: mins, location: fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } : null } }),
    );
    if (res) toast.success(t("checkin.started", { time: formatTime(res.checkIn!.dueAt) }));
  };

  const update = (action: "complete" | "cancel" | "extend", extendMinutes?: number) =>
    act(action, () => api("/api/checkin/complete", { body: { checkInId: checkIn!.id, action, extendMinutes } })).then((res) => {
      if (!res) return;
      if (action === "complete") toast.success(t("checkin.completed"));
      if (action !== "extend") mutate(() => ({ checkIn: null, serverTime: res.serverTime }));
    });

  const enablePush = async () => {
    const result = await subscribeToPush("/api/push/subscribe");
    if (result === "subscribed") {
      setPushReady(true);
      toast.success(t("push.enabled"));
    } else toast.error(t(`push.${result}`));
  };

  if (!checkIn) {
    return (
      <Panel className={cn("p-5", className)}>
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-safe-soft text-safe-ink">
            <AlarmClock className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-extrabold tracking-[-0.01em]">{t("checkin.title")}</h2>
            <p className="mt-0.5 text-[15px] leading-relaxed text-ink-2">{t("checkin.description")}</p>
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-semibold text-ink-2">{t("checkin.checkInAfter")}</legend>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={minutes === m && !custom}
                onClick={() => {
                  setMinutes(m);
                  setCustom("");
                }}
                className={cn(
                  "tabular h-12 rounded-[var(--radius-control)] text-[15px] font-bold ring-1 ring-inset transition-colors",
                  minutes === m && !custom ? "bg-navy-900 text-white ring-navy-900" : "bg-surface text-ink ring-line-strong hover:bg-ground",
                )}
              >
                {m < 60 ? t("checkin.minutesShort", { count: m }) : t("checkin.hoursShort", { count: m / 60 })}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="checkin-custom" className="text-sm font-semibold text-ink-2">
              {t("checkin.custom")}
            </label>
            <Input
              id="checkin-custom"
              inputMode="numeric"
              placeholder={t("checkin.customPlaceholder")}
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="h-11 w-28"
            />
            <span className="text-sm text-ink-3">{t("checkin.minutesUnit")}</span>
          </div>
        </fieldset>
        <Button size="lg" variant="safe" block className="mt-4" loading={busy === "start"} onClick={() => start(custom ? Number(custom) : minutes)}>
          {t("checkin.start")}
        </Button>
      </Panel>
    );
  }

  const escalated = checkIn.status === "escalated";
  return (
    <Panel
      className={cn("p-5", overdue && "ring-2 ring-warn", escalated && "ring-2 ring-sos", className)}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-[-0.01em]">{t("checkin.activeTitle")}</h2>
        <span className={cn("text-sm font-semibold", overdue ? "text-warn" : "text-ink-3")}>{t("checkin.due", { time: formatTime(checkIn.dueAt) })}</span>
      </div>
      <p className={cn("tabular mt-2 text-[44px] font-extrabold leading-none tracking-[-0.03em]", overdue ? "text-warn" : "text-ink")}>
        {overdue ? fmt(escalateAt - (now + offset)) : fmt(remaining)}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        {escalated
          ? t("checkin.escalated")
          : overdue
            ? t("checkin.overdue", { time: formatTime(escalateAt) })
            : t("checkin.running", { minutes: checkIn.graceMinutes })}
      </p>
      <Button size="xl" variant="safe" block className="mt-4" loading={busy === "complete"} onClick={() => update("complete")}>
        <Check aria-hidden />
        {t("checkin.imSafe")}
      </Button>
      {!escalated ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="outline" loading={busy === "extend"} onClick={() => update("extend", 15)}>
            <Plus aria-hidden />
            {t("checkin.extend")}
          </Button>
          <Button variant="ghost" loading={busy === "cancel"} onClick={() => update("cancel")}>
            <X aria-hidden />
            {t("common.cancel")}
          </Button>
        </div>
      ) : null}
      {pushReady === false && pushSupport() !== "unsupported" ? (
        <button type="button" onClick={enablePush} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-navy-700 underline">
          <BellRing className="size-4" aria-hidden />
          {t("checkin.enableReminders")}
        </button>
      ) : null}
    </Panel>
  );
}
