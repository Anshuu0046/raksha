import type { Metadata } from "next";
import { HelplinesList } from "@/components/dashboard/helplines-list";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("helplines.title") };
}

export default function HelplinesPage() {
  return <HelplinesList />;
}
