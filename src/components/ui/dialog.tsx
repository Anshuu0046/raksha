"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Bottom sheet on phones (reachable with one thumb), centred dialog on larger screens.
 */
export function DialogContent({
  className,
  children,
  title,
  description,
  tone = "default",
  hideClose,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  tone?: "default" | "danger";
  hideClose?: boolean;
}) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-950/60 data-[state=open]:animate-[fade-in_160ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[22px] bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[var(--shadow-lift)] focus:outline-none",
          "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(560px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[22px] sm:p-7",
          "data-[state=open]:animate-[sheet-in_240ms_var(--ease-out-expo)]",
          className,
        )}
        {...props}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <DialogPrimitive.Title className={cn("text-xl font-extrabold tracking-tight", tone === "danger" ? "text-sos-ink" : "text-ink")}>
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : ""}</DialogPrimitive.Description>
            )}
          </div>
          {!hideClose ? (
            <DialogPrimitive.Close className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-ground" aria-label={t("common.close")}>
              <X className="size-5" />
            </DialogPrimitive.Close>
          ) : null}
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
