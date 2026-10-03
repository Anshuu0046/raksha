import { AlertTriangle, CheckCircle2, Info, WifiOff } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "sos" | "safe" | "warn" | "navy";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-ground text-ink-2 ring-line",
    sos: "bg-sos-soft text-sos-ink ring-sos/25",
    safe: "bg-safe-soft text-safe-ink ring-safe/25",
    warn: "bg-warn-soft text-warn ring-warn/25",
    navy: "bg-navy-900 text-white ring-navy-900",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Inline message for states: every failure says what happened and what to do next. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warn" | "error" | "success" | "offline";
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const map = {
    info: { cls: "bg-surface ring-line text-ink", icon: Info, iconCls: "text-navy-700" },
    warn: { cls: "bg-warn-soft ring-warn/25 text-ink", icon: AlertTriangle, iconCls: "text-warn" },
    error: { cls: "bg-sos-soft ring-sos/25 text-ink", icon: AlertTriangle, iconCls: "text-sos-ink" },
    success: { cls: "bg-safe-soft ring-safe/25 text-ink", icon: CheckCircle2, iconCls: "text-safe-ink" },
    offline: { cls: "bg-navy-900 ring-navy-900 text-white", icon: WifiOff, iconCls: "text-white" },
  } as const;
  const m = map[tone];
  const Icon = m.icon;
  return (
    <div role={tone === "error" || tone === "offline" ? "alert" : "status"} className={cn("flex gap-3 rounded-[var(--radius-panel)] p-4 ring-1 ring-inset", m.cls, className)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", m.iconCls)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{title}</p>
        {children ? <div className={cn("mt-1 text-sm leading-relaxed", tone === "offline" ? "text-navy-200" : "text-ink-2")}>{children}</div> : null}
        {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function Panel({ className, children, as: Comp = "section", ...props }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return (
    <Comp className={cn("rounded-[var(--radius-panel)] bg-surface shadow-[var(--shadow-panel)] ring-1 ring-line/70", className)} {...props}>
      {children}
    </Comp>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-line/70", className)} aria-hidden />;
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span className={cn("size-5 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export function PageHeader({ title, description, action }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}
