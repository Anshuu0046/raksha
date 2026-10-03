// Generates PWA icons from the Raksha beacon mark. Run: npm run icons
// Provenance: authored vector (src/app/icon.svg geometry), rasterised with sharp. No generated imagery.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const NAVY = "#0d1b2a";
const RED = "#d91f2c";
const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

function mark({ size, padding, bg, ring, radius }) {
  const c = size / 2;
  const r = (size / 2 - padding) * 0.78;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : ""}
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${ring}" stroke-width="${r * 0.29}"/>
    <circle cx="${c}" cy="${c}" r="${r * 0.45}" fill="${ring}"/>
  </svg>`);
}

const jobs = [
  { file: "icon-192.png", size: 192, padding: 28, bg: NAVY, ring: RED, radius: 40 },
  { file: "icon-512.png", size: 512, padding: 72, bg: NAVY, ring: RED, radius: 108 },
  // Maskable: content inside the 80% safe zone, full-bleed background.
  { file: "maskable-512.png", size: 512, padding: 130, bg: NAVY, ring: RED, radius: 0 },
  { file: "apple-touch-icon.png", size: 180, padding: 28, bg: NAVY, ring: RED, radius: 0 },
  // Android notification badge: white on transparent.
  { file: "badge-96.png", size: 96, padding: 10, bg: null, ring: "#ffffff", radius: 0 },
];

for (const j of jobs) {
  await sharp(mark(j)).png().toFile(fileURLToPath(new URL(j.file, out)));
  console.log("wrote", j.file);
}
