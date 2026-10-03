"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/field";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";

/** Signed-out language switch (cookie). Signed-in users change it in Settings. */
export function LanguageSelect() {
  const { t, locale } = useI18n();
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span>{t("settings.language")}</span>
      <NativeSelect
        value={locale}
        className="h-10 w-44 text-sm"
        onChange={(e) => {
          document.cookie = `raksha_locale=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l].native}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
