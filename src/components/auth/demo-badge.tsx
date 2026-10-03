"use client";

import { useT } from "@/lib/i18n/client";

export function DemoBadge() {
  const t = useT();
  return (
    <p className="mb-6 rounded-[var(--radius-control)] bg-warn-soft px-4 py-3 text-sm text-ink ring-1 ring-inset ring-warn/25">
      <strong className="font-extrabold uppercase tracking-[0.06em] text-warn">{t("demo.badge")}</strong> · {t("demo.authNote")}
    </p>
  );
}
