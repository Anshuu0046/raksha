import en from "@locales/en.json";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { createTranslator, mergeDictionaries, type Dictionary } from "./translate";

const loaders: Record<Locale, () => Promise<{ default: Dictionary }>> = {
  en: () => import("@locales/en.json"),
  hi: () => import("@locales/hi.json"),
  or: () => import("@locales/or.json"),
};

const cache = new Map<Locale, Dictionary>();

/** Returns the locale's dictionary overlaid on English, so missing keys fall back cleanly. */
export async function getDictionary(locale: string | null | undefined): Promise<Dictionary> {
  const l: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const cached = cache.get(l);
  if (cached) return cached;
  const base = en as Dictionary;
  const dict = l === "en" ? base : mergeDictionaries(base, (await loaders[l]()).default);
  cache.set(l, dict);
  return dict;
}

export async function getTranslator(locale: string | null | undefined) {
  return createTranslator(await getDictionary(locale), en as Dictionary);
}
