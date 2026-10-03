import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { PhoneOtpForm } from "@/components/auth/auth-forms";
import { otpAvailable } from "@/lib/auth/accounts";
import { getCurrentUser } from "@/lib/auth/server";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.continuePhone") };
}

export default async function PhoneLoginPage() {
  if (await getCurrentUser()) redirect("/app");
  if (!otpAvailable()) redirect("/login?error=phone_unavailable");
  const { t } = await getI18n();
  return (
    <AuthShell title={t("auth.phoneTitle")} description={t("auth.phoneDescription")}>
      <PhoneOtpForm />
    </AuthShell>
  );
}
