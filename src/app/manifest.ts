import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Raksha: Emergency SOS",
    short_name: "Raksha",
    description: "One-tap emergency SOS, live location sharing and nearby help.",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d1b2a",
    theme_color: "#0d1b2a",
    categories: ["lifestyle", "utilities", "medical"],
    lang: "en-IN",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "SOS", short_name: "SOS", url: "/app?source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Emergency numbers", short_name: "Helplines", url: "/app/helplines", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
