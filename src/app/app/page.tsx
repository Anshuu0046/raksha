import type { Metadata } from "next";
import { HomeScreen } from "@/components/dashboard/home-screen";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.home") };
}

export default function HomePage() {
  return <HomeScreen />;
}
