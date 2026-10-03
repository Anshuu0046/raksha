import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12">
      <LogoMark className="size-10" />
      <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.02em]">{t("errors.notFoundTitle")}</h1>
      <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{t("errors.notFoundBody")}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/app">{t("errors.goHome")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/app/helplines">{t("nav.helplines")}</Link>
        </Button>
      </div>
    </main>
  );
}
