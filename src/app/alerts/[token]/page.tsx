import type { Metadata } from "next";
import { AlertOptIn } from "@/components/contacts/alert-optin";
import { getRepository } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { hashToken, looksLikeToken } from "@/lib/security/tokens";
import { firstName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("alertsOptIn.metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Trusted contacts open this from their test message to receive instant push alerts. */
export default async function AlertOptInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let ownerName: string | null = null;
  if (looksLikeToken(token)) {
    const contact = await getRepository().getContactByAlertTokenHash(hashToken(token));
    const owner = contact ? await getRepository().getUserById(contact.userId) : null;
    ownerName = owner ? firstName(owner.name) : null;
  }
  return <AlertOptIn token={token} ownerName={ownerName} valid={Boolean(ownerName)} />;
}
