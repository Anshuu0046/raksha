"use client";

import { createContext, useContext, useMemo } from "react";
import { INTL_LOCALE, type Locale } from "./config";
import { createTranslator, type Dictionary, type Translator } from "./translate";

interface I18nValue {
  locale: Locale;
  t: Translator;
  /** Intl-formatted helpers bound to the active locale. */
  formatTime: (iso: string | number | Date) => string;
  formatDateTime: (iso: string | number | Date) => string;
  formatDate: (iso: string | number | Date) => string;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nValue>(() => {
    const tag = INTL_LOCALE[locale];
    const time = new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit" });
    const dateTime = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" });
    const date = new Intl.DateTimeFormat(tag, { dateStyle: "long" });
    return {
      locale,
      t: createTranslator(dict),
      formatTime: (v) => time.format(new Date(v)),
      formatDateTime: (v) => dateTime.format(new Date(v)),
      formatDate: (v) => date.format(new Date(v)),
      formatNumber: (n, opts) => new Intl.NumberFormat(tag, opts).format(n),
    };
  }, [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function useT(): Translator {
  return useI18n().t;
}
