import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/server";
import { isLocale, LOCALE_COOKIE, matchAcceptLanguage, type Locale } from "./config";
import { getDictionary, getTranslator } from "./dictionaries";

/** Locale precedence: signed-in user's setting → cookie → Accept-Language → English. */
export async function getRequestLocale(): Promise<Locale> {
  const user = await getCurrentUser().catch(() => null);
  if (user && isLocale(user.locale)) return user.locale;
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return matchAcceptLanguage((await headers()).get("accept-language"));
}

export async function getI18n() {
  const locale = await getRequestLocale();
  const [dict, t] = await Promise.all([getDictionary(locale), getTranslator(locale)]);
  return { locale, dict, t };
}
