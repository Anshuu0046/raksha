"use client";

import { useEffect } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

/** Route-level error UI: never a blank screen, always a way to call for help. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12">
      <LogoMark className="size-10" />
      <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.02em]">{t("errors.genericTitle")}</h1>
      <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{t("errors.genericBody")}</p>
      <div className="mt-8 flex flex-col gap-3">
        <Button size="lg" onClick={reset}>
          {t("common.retry")}
        </Button>
        <a href="tel:112" className="inline-flex h-14 items-center justify-center rounded-[var(--radius-control)] bg-sos px-6 font-bold text-white">
          {t("errors.call112")}
        </a>
      </div>
    </main>
  );
}
