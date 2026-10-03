import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { requirePageUser } from "@/lib/auth/server";
import { toPublicUser } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("onboarding.metaTitle"), robots: { index: false } };
}

export default async function OnboardingPage() {
  const user = await requirePageUser();
  if (user.onboardedAt) redirect("/app");
  return <OnboardingFlow user={toPublicUser(user)} demo={isDemoMode()} />;
}
