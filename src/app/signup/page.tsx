import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/auth-forms";
import { googleLoginEnabled, otpAvailable } from "@/lib/auth/accounts";
import { getCurrentUser } from "@/lib/auth/server";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.createAccount") };
}

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/app");
  const { t } = await getI18n();
  return (
    <AuthShell title={t("auth.signupTitle")} description={t("auth.signupDescription")}>
      <SignupForm google={googleLoginEnabled()} phoneOtp={otpAvailable()} />
    </AuthShell>
  );
}
