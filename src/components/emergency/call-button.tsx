"use client";

import { Phone } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

/**
 * A tel: link. In demo mode, emergency-service numbers are intercepted with a notice so a demo
 * can never dial 112/100/108 by accident. Trusted contacts are always dialled for real.
 */
export function CallButton({
  number,
  label,
  sublabel,
  emergencyService,
  demo,
  className,
  variant = "default",
  size = "lg",
  block,
  icon = true,
}: {
  number: string;
  label: React.ReactNode;
  sublabel?: React.ReactNode;
  emergencyService: boolean;
  demo: boolean;
  className?: string;
  /** true = phone icon, false = none, or a custom icon element. */
  icon?: boolean | React.ReactNode;
} & VariantProps<typeof buttonVariants>) {
  const t = useT();
  const intercept = demo && emergencyService;
  return (
    <a
      href={`tel:${number.replace(/\s/g, "")}`}
      onClick={(e) => {
        if (intercept) {
          e.preventDefault();
          toast.info(t("demo.callIntercepted", { number }));
        }
      }}
      className={cn(buttonVariants({ variant, size, block }), sublabel ? "h-auto min-h-16 flex-col gap-0.5 py-2.5" : "", className)}
    >
      <span className="inline-flex items-center gap-2">
        {icon === true ? <Phone aria-hidden /> : icon || null}
        {label}
      </span>
      {sublabel ? <span className="tabular text-[13px] font-medium opacity-80">{sublabel}</span> : null}
    </a>
  );
}
