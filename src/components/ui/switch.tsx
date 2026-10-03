"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer relative inline-flex h-8 w-[52px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-line-strong transition-colors data-[state=checked]:bg-navy-900 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-7 rounded-full bg-white shadow-[0_1px_3px_rgb(13_27_42/0.3)] transition-transform duration-200 ease-[var(--ease-out-expo)] data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

/** A full-row toggle: the whole row is the touch target. */
export function SwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-3">
      <label htmlFor={id} className="flex-1 cursor-pointer">
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-sm text-ink-3">{description}</span> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
