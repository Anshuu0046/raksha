// Verifies translation coverage. Run: npm run i18n:check
//  - every static t("key") used in src/ must exist in locales/en.json (fails otherwise)
//  - every other locale is reported with its coverage of en.json (missing keys fall back to English)
//  - placeholders ({name}) must match English in every translated string (fails otherwise)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(root, "src");
const LOCALES = join(root, "locales");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

const used = new Set();
const dynamicPrefixes = new Set();
const re = /\bt\(\s*(["'`])([^"'`]+?)\1/g;
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(re)) {
    const key = m[2];
    if (m[1] === "`" && key.includes("${")) dynamicPrefixes.add(key.split("${")[0]);
    else used.add(key);
  }
}

const en = flatten(JSON.parse(readFileSync(join(LOCALES, "en.json"), "utf8")));
const missing = [...used].filter((k) => !(k in en)).sort();
const dynamicMissing = [...dynamicPrefixes].filter((p) => !Object.keys(en).some((k) => k.startsWith(p))).sort();

let failed = false;
if (missing.length || dynamicMissing.length) {
  failed = true;
  console.error(`✖ en.json is missing ${missing.length} key(s):`);
  for (const k of missing) console.error(`   ${k}`);
  for (const p of dynamicMissing) console.error(`   ${p}* (dynamic prefix)`);
} else {
  console.log(`✔ en.json covers all ${used.size} static keys (+${dynamicPrefixes.size} dynamic prefixes)`);
}

const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const file of readdirSync(LOCALES).filter((f) => f.endsWith(".json") && f !== "en.json").sort()) {
  const dict = flatten(JSON.parse(readFileSync(join(LOCALES, file), "utf8")));
  const keys = Object.keys(en);
  const have = keys.filter((k) => k in dict).length;
  const badVars = keys.filter((k) => k in dict && vars(dict[k]) !== vars(en[k]));
  const pct = ((have / keys.length) * 100).toFixed(1);
  console.log(`${badVars.length ? "✖" : "•"} ${file.padEnd(8)} ${String(have).padStart(4)}/${keys.length} keys (${pct}%)`);
  if (badVars.length) {
    failed = true;
    for (const k of badVars.slice(0, 20)) console.error(`   placeholder mismatch: ${k}  en={${vars(en[k])}} ${file}={${vars(dict[k])}}`);
  }
}

process.exit(failed ? 1 : 0);
