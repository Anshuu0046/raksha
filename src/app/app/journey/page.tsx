import type { Metadata } from "next";
import { JourneyPlanner } from "@/components/dashboard/journey-planner";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("journey.title") };
}

export default function JourneyPage() {
  return <JourneyPlanner />;
}
