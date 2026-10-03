import type { CapacitorConfig } from "@capacitor/cli";

// The app is a native shell around the deployed Raksha site, so every web release reaches the app
// without a store update. Override with RAKSHA_APP_URL (https) to point a build at another deployment.
const url = process.env.RAKSHA_APP_URL ?? "https://raksha-tau-lyart.vercel.app";
if (!url?.startsWith("https://")) throw new Error("Set RAKSHA_APP_URL to the https production URL before running cap.");

const config: CapacitorConfig = {
  appId: "app.raksha.safety",
  appName: "Raksha",
  webDir: "mobile-web",
  server: { url, cleartext: false },
  android: { allowMixedContent: false },
  backgroundColor: "#0d1b2a",
};

export default config;
