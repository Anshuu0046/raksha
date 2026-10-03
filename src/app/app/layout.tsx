import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { EmergencyProvider } from "@/components/emergency/emergency-provider";
import { AppDataProvider } from "@/components/providers/app-data-provider";
import { LocationProvider } from "@/components/providers/location-provider";
import { requirePageUser } from "@/lib/auth/server";
import { toPublicUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { primaryNumbers, resolveHelplines } from "@/lib/helplines";

export const metadata: Metadata = { robots: { index: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  if (!user.onboardedAt) redirect("/onboarding");
  const repo = getRepository();
  const [overrides, active] = await Promise.all([
    repo.listEmergencyNumbers().catch(() => []),
    repo.getActiveEmergency(user.id),
  ]);
  const helplines = resolveHelplines(user.preferences.region, overrides);
  const demo = isDemoMode();

  return (
    <AppDataProvider initialUser={toPublicUser(user)} helplines={helplines} primary={primaryNumbers(helplines)} demo={demo}>
      <LocationProvider demo={demo}>
        <EmergencyProvider initialActiveEventId={active?.id ?? null}>
          <AppShell>{children}</AppShell>
        </EmergencyProvider>
      </LocationProvider>
    </AppDataProvider>
  );
}
