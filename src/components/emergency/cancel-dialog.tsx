"use client";

import { CheckCircle2, CircleSlash } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { EndReason } from "./emergency-provider";

/**
 * Ending an emergency takes two deliberate steps: choose why, then confirm.
 * "Keep emergency active" is always the larger, easier target.
 */
export function CancelEmergencyDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: EndReason) => Promise<void> | void;
}) {
  const t = useT();
  const [reason, setReason] = useState<EndReason | null>(null);
  const [busy, setBusy] = useState(false);
  const options: Array<{ value: EndReason; label: string; hint: string; icon: typeof CheckCircle2 }> = [
    { value: "safe", label: t("emergency.cancel.safe"), hint: t("emergency.cancel.safeHint"), icon: CheckCircle2 },
    { value: "mistake", label: t("emergency.cancel.mistake"), hint: t("emergency.cancel.mistakeHint"), icon: CircleSlash },
  ];
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason(null);
        onOpenChange(v);
      }}
    >
      <DialogContent title={t("emergency.cancel.title")} description={t("emergency.cancel.description")} tone="danger">
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">{t("emergency.cancel.reasonLegend")}</legend>
          {options.map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex min-h-16 cursor-pointer items-start gap-3 rounded-[var(--radius-control)] p-4 ring-1 ring-inset transition-colors",
                reason === o.value ? "bg-navy-900 text-white ring-navy-900" : "bg-surface text-ink ring-line-strong hover:bg-ground",
              )}
            >
              <input type="radio" name="end-reason" value={o.value} checked={reason === o.value} onChange={() => setReason(o.value)} className="sr-only" />
              <o.icon className={cn("mt-0.5 size-6 shrink-0", reason === o.value ? "text-white" : o.value === "safe" ? "text-safe" : "text-ink-3")} aria-hidden />
              <span>
                <span className="block text-base font-bold">{o.label}</span>
                <span className={cn("mt-0.5 block text-sm", reason === o.value ? "text-navy-200" : "text-ink-3")}>{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="mt-6 flex flex-col gap-3">
          <Button size="xl" variant="sos" block onClick={() => onOpenChange(false)}>
            {t("emergency.cancel.keep")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            block
            disabled={!reason}
            loading={busy}
            onClick={async () => {
              if (!reason) return;
              setBusy(true);
              try {
                await onConfirm(reason);
                onOpenChange(false);
              } finally {
                setBusy(false);
                setReason(null);
              }
            }}
          >
            {reason ? t("emergency.cancel.confirm") : t("emergency.cancel.chooseFirst")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
