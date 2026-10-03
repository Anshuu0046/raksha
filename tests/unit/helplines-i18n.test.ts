import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMERGENCY_NUMBERS } from "@/config/emergencyNumbers";
import { primaryNumbers, resolveHelplines } from "@/lib/helplines";
import { matchAcceptLanguage } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/dictionaries";
import { createTranslator, format } from "@/lib/i18n/translate";
import type { EmergencyNumber } from "@/types";

describe("emergency helplines", () => {
  it("every configured number has a name, purpose, region and availability notes", () => {
    for (const n of EMERGENCY_NUMBERS) {
      expect(n.name && n.purpose && n.availabilityNotes && n.region, n.id).toBeTruthy();
      expect(n.number).toMatch(/^[0-9]{3,12}$/);
    }
    for (const required of ["112", "100", "108", "181", "1091", "1098"]) {
      expect(EMERGENCY_NUMBERS.some((n) => n.number === required), required).toBe(true);
    }
  });

  it("lists 112 first", () => {
    expect(resolveHelplines("IN")[0]!.number).toBe("112");
  });

  it("lets a state override a national number without touching UI", () => {
    const override: EmergencyNumber = {
      ...resolveHelplines("IN").find((h) => h.id === "ambulance-108")!,
      region: "IN-OR",
      number: "1099",
      updatedAt: new Date().toISOString(),
    };
    expect(primaryNumbers(resolveHelplines("IN-OR", [override])).ambulance).toBe("1099");
    expect(primaryNumbers(resolveHelplines("IN-KA", [override])).ambulance).toBe("108");
  });

  it("can deactivate a number", () => {
    const off: EmergencyNumber = { ...resolveHelplines("IN").find((h) => h.id === "women-1091")!, active: false, updatedAt: "" };
    expect(resolveHelplines("IN", [off]).some((h) => h.id === "women-1091")).toBe(false);
  });
});

describe("i18n", () => {
  it("interpolates and falls back to English for missing keys", async () => {
    expect(format("Hi {name}", { name: "Ananya" })).toBe("Hi Ananya");
    const t = createTranslator({ a: { b: "नमस्ते {name}" } }, { a: { c: "English only" } });
    expect(t("a.b", { name: "अनन्या" })).toBe("नमस्ते अनन्या");
    expect(t("a.c")).toBe("English only");
    expect(t("missing.key")).toBe("missing.key");
    const hi = await getTranslator("hi");
    expect(hi("emergency.callPolice")).not.toBe("emergency.callPolice");
  });

  it("matches Accept-Language to supported locales", () => {
    expect(matchAcceptLanguage("or-IN,or;q=0.9,en;q=0.5")).toBe("or");
    expect(matchAcceptLanguage("fr-FR,fr")).toBe("en");
    expect(matchAcceptLanguage(null)).toBe("en");
  });

  it("every locale file is valid JSON and keeps English placeholders", () => {
    const flatten = (o: Record<string, unknown>, p = ""): Record<string, string> =>
      Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
        const key = p ? `${p}.${k}` : k;
        if (v && typeof v === "object") Object.assign(acc, flatten(v as Record<string, unknown>, key));
        else acc[key] = String(v);
        return acc;
      }, {});
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const en = flatten(JSON.parse(readFileSync("locales/en.json", "utf8")));
    const files = readdirSync("locales").filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(3);
    for (const f of files) {
      const dict = flatten(JSON.parse(readFileSync(`locales/${f}`, "utf8")));
      for (const [k, v] of Object.entries(dict)) {
        expect(en[k], `${f}: unknown key ${k}`).toBeDefined();
        expect(vars(v), `${f}: ${k}`).toBe(vars(en[k]!));
      }
    }
  });
});
