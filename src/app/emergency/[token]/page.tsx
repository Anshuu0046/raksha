import type { Metadata } from "next";
import { ContactPortal } from "@/components/emergency/contact-portal";
import { ApiError } from "@/lib/api/errors";
import { getRepository } from "@/lib/db";
import { resolvePublicEmergency } from "@/lib/emergency/service";
import { isDemoMode } from "@/lib/env";
import { resolveHelplines } from "@/lib/helplines";
import { getI18n } from "@/lib/i18n/server";
import type { PublicEmergencyView } from "@/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  // Deliberately generic: link previews in chat apps must not reveal names or locations.
  return { title: t("portal.metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Public page for trusted contacts. No account needed: the random token is the credential. */
export default async function EmergencyPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let view: PublicEmergencyView | null = null;
  let error: { code: string; message: string } | null = null;
  try {
    view = await resolvePublicEmergency(token);
  } catch (err) {
    error = err instanceof ApiError ? { code: err.code, message: err.message } : { code: "TOKEN_INVALID", message: "Invalid link" };
  }
  const overrides = await getRepository().listEmergencyNumbers().catch(() => []);
  const helplines = resolveHelplines(view?.region ?? "IN", overrides);
  return <ContactPortal token={token} initial={view} initialError={error} helplines={helplines} demo={isDemoMode()} />;
}
