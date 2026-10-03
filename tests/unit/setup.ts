import { afterEach, beforeEach, vi } from "vitest";
import { setRepository } from "@/lib/db";
import { MemoryRepository } from "@/lib/db/memory";
import { setNotificationProvidersForTesting } from "@/lib/notifications/dispatcher";
import { flushBackground } from "@/lib/server/background";

beforeEach(() => {
  setRepository(new MemoryRepository(null));
  setNotificationProvidersForTesting({});
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
  delete process.env.SMS_PROVIDER;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(async () => {
  await flushBackground();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
