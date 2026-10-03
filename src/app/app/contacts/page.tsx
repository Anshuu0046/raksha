import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactsManager } from "@/components/contacts/contacts-manager";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("contacts.title") };
}

export default function ContactsPage() {
  return (
    <Suspense>
      <ContactsManager />
    </Suspense>
  );
}
