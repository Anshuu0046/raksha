import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@locales": fileURLToPath(new URL("./locales", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/unit/setup.ts"],
    env: { RAKSHA_TEST: "1", AUTH_SECRET: "test-secret-test-secret-test-secret-123", NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
  },
});
