import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { PageHeader } from "@/components/ui/misc";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("admin.title") };
}

export default async function AdminPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t("admin.title")} description={t("admin.description")} />
      <AdminDashboard />
    </>
  );
}
