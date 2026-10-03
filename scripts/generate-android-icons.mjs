// Generates the Android launcher icons and splash screens from the Raksha beacon mark.
// Run: node scripts/generate-android-icons.mjs (then `npx cap sync android`).
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const NAVY = "#0d1b2a";
const RED = "#d91f2c";
const res = new URL("../android/app/src/main/res/", import.meta.url);

const mark = (size, scale, withBg, rx = 0) => {
  const c = size / 2;
  const r = (size / 2) * scale;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${withBg ? `<rect width="${size}" height="${size}" rx="${rx}" fill="${NAVY}"/>` : ""}
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${RED}" stroke-width="${r * 0.29}"/>
    <circle cx="${c}" cy="${c}" r="${r * 0.45}" fill="${RED}"/>
  </svg>`);
};

// density: [legacy launcher px, adaptive foreground px]
const densities = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };

for (const [d, [legacy, adaptive]] of Object.entries(densities)) {
  const dir = new URL(`mipmap-${d}/`, res);
  await sharp(mark(legacy, 0.6, true, legacy * 0.2)).png().toFile(new URL("ic_launcher.png", dir).pathname.slice(1).replace(/%20/g, " "));
  await sharp(mark(legacy, 0.6, true, legacy / 2)).png().toFile(new URL("ic_launcher_round.png", dir).pathname.slice(1).replace(/%20/g, " "));
  // Adaptive foreground: the mark stays inside the central 66/108 safe zone.
  await sharp(mark(adaptive, 0.42, false)).png().toFile(new URL("ic_launcher_foreground.png", dir).pathname.slice(1).replace(/%20/g, " "));
}

writeFileSync(
  new URL("values/ic_launcher_background.xml", res),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${NAVY}</color>\n</resources>\n`,
);

// Splash screens: keep each file's existing size, navy ground with the mark centred.
for (const dirent of readdirSync(res, { withFileTypes: true })) {
  if (!dirent.isDirectory() || !dirent.name.startsWith("drawable")) continue;
  const file = new URL(`${dirent.name}/splash.png`, res);
  const path = decodeURIComponent(file.pathname.slice(1));
  if (!existsSync(path)) continue;
  const { width, height } = await sharp(path).metadata();
  const m = Math.round(Math.min(width, height) * 0.28);
  const markPng = await sharp(mark(m, 0.8, false)).png().toBuffer();
  await sharp({ create: { width, height, channels: 3, background: NAVY } })
    .composite([{ input: markPng, gravity: "centre" }])
    .png()
    .toFile(path + ".tmp");
  const fs = await import("node:fs");
  fs.renameSync(path + ".tmp", path);
}
console.log("Android icons and splash screens generated.");
