import type { Metadata } from "next";
import { HelplineEditor } from "@/components/admin/helpline-editor";
import { PageHeader } from "@/components/ui/misc";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("admin.helplines.title") };
}

export default async function AdminHelplinesPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t("admin.helplines.title")} description={t("admin.helplines.description")} />
      <HelplineEditor />
    </>
  );
}
