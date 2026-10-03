import { cn } from "@/lib/utils";

/** Raksha mark: a beacon (signal ring around a point). Same geometry as the app icon. */
export function LogoMark({ className, tone = "red" }: { className?: string; tone?: "red" | "white" | "navy" }) {
  const ring = tone === "red" ? "#D91F2C" : tone === "white" ? "#FFFFFF" : "#0D1B2A";
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <circle cx="16" cy="16" r="12.5" fill="none" stroke={ring} strokeWidth="3.2" />
      <circle cx="16" cy="16" r="5.5" fill={ring} />
    </svg>
  );
}

export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark tone={onDark ? "white" : "red"} className="size-7" />
      <span className={cn("text-[21px] font-extrabold tracking-[-0.03em]", onDark ? "text-white" : "text-ink")}>Raksha</span>
    </span>
  );
}
