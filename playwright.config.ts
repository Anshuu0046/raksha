import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const BASE = `http://localhost:${PORT}`;

/**
 * End-to-end tests run against a dev server in demo mode with an in-memory database:
 * no real SMS, email, push or calls can ever be sent.
 * Uses the locally installed Microsoft Edge (PLAYWRIGHT_CHANNEL=chrome or chromium to change).
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
        permissions: ["geolocation"],
        geolocation: { latitude: 20.2961, longitude: 85.8245, accuracy: 15 },
      },
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `${BASE}/api/health`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_DEMO_MODE: "true",
      NEXT_PUBLIC_APP_URL: BASE,
      AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
      ADMIN_EMAILS: "admin@raksha.test",
      RAKSHA_MEMORY_PERSIST: "false",
      // Never let tests reach the real database or any real provider, whatever .env.local contains.
      DATABASE_URL: "",
      MIGRATION_DATABASE_URL: "",
      SMS_PROVIDER: "",
      RESEND_API_KEY: "",
      SMTP_USER: "",
      SMTP_PASS: "",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
