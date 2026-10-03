import type { Metadata } from "next";
import { Suspense } from "react";
import { NearbyHelp } from "@/components/maps/nearby-help";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nearby.title") };
}

export default function HelpPage() {
  return (
    <Suspense>
      <NearbyHelp />
    </Suspense>
  );
}
