import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";
import { googleLoginEnabled, otpAvailable } from "@/lib/auth/accounts";
import { getCurrentUser } from "@/lib/auth/server";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.signIn") };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/app");
  const { t } = await getI18n();
  return (
    <AuthShell title={t("auth.signInTitle")} description={t("auth.signInDescription")}>
      <Suspense>
        <LoginForm google={googleLoginEnabled()} phoneOtp={otpAvailable()} />
      </Suspense>
    </AuthShell>
  );
}
