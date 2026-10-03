/** Supported UI and alert languages. Add a locale here and in /locales/<code>.json to extend. */
export const LOCALES = ["en", "hi", "or"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "raksha_locale";

/** Native names so a user can find her language without reading English. */
export const LOCALE_NAMES: Record<Locale, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  hi: { native: "हिन्दी", english: "Hindi" },
  or: { native: "ଓଡ଼ିଆ", english: "Odia" },
};

/** BCP-47 tags for Intl formatting (dates, numbers). */
export const INTL_LOCALE: Record<Locale, string> = {
  en: "en-IN",
  hi: "hi-IN",
  or: "or-IN",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Picks the best supported locale from an Accept-Language header. */
export function matchAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const tags = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
