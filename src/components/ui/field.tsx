import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 text-base text-ink placeholder:text-ink-3 transition-colors focus-visible:border-navy-700 focus-visible:outline-2 focus-visible:outline-offset-0 aria-invalid:border-sos aria-invalid:outline-sos disabled:bg-ground disabled:opacity-70",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-3 focus-visible:border-navy-700 focus-visible:outline-2 focus-visible:outline-offset-0",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

/** Native select: the most reliable control on low-end Android and with screen readers. */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-12 w-full appearance-none rounded-[var(--radius-control)] border border-line-strong bg-surface pl-4 pr-10 text-base text-ink focus-visible:border-navy-700 focus-visible:outline-2 focus-visible:outline-offset-0",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-3">
        <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[15px] font-semibold text-ink", className)} {...props} />;
}

/** Label + control + hint + error, wired with ids so screen readers announce errors. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
  optional,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactElement<Record<string, unknown>>;
  className?: string;
  optional?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = React.cloneElement(children, {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
  });
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="ml-1.5 font-normal text-ink-3">{optional}</span> : null}
      </Label>
      {control}
      {hint && !error ? (
        <p id={hintId} className="text-sm text-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-sos-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
