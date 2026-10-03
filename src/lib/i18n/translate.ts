/** A nested dictionary of translation strings, loaded from /locales/<locale>.json. */
export type Dictionary = { [key: string]: string | Dictionary };

export type TranslateVars = Record<string, string | number>;

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: string | Dictionary | undefined = dict;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Interpolates {name} placeholders. */
export function format(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : match,
  );
}

/**
 * Builds a translate function. Missing keys fall back to English, then to the key itself,
 * so an untranslated string is never a blank space in the UI.
 */
export function createTranslator(dict: Dictionary, fallback?: Dictionary) {
  return function t(key: string, vars?: TranslateVars): string {
    const value = lookup(dict, key) ?? (fallback ? lookup(fallback, key) : undefined);
    if (value === undefined) {
      if (process.env.NODE_ENV === "development") console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
    return format(value, vars);
  };
}

export type Translator = ReturnType<typeof createTranslator>;

/** Deep merge used to overlay a locale onto English. */
export function mergeDictionaries(base: Dictionary, overlay: Dictionary): Dictionary {
  const out: Dictionary = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    const existing = out[k];
    out[k] = typeof v === "object" && typeof existing === "object" ? mergeDictionaries(existing, v) : v;
  }
  return out;
}
