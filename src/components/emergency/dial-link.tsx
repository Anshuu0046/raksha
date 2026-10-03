"use client";

import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";
import { tryDirectCall } from "@/lib/native/direct-call";

/** A bare tel: anchor for emergency numbers that is intercepted in demo mode. */
export function DialLink({ number, demo, className, children }: { number: string; demo: boolean; className?: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <a
      href={`tel:${number}`}
      className={className}
      onClick={(e) => {
        if (demo) {
          e.preventDefault();
          toast.info(t("demo.callIntercepted", { number }));
        } else if (tryDirectCall(number)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </a>
  );
}
