import type { Metadata } from "next";
import { HistoryTimeline } from "@/components/dashboard/history-timeline";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("history.title") };
}

export default function HistoryPage() {
  return <HistoryTimeline />;
}
