import { Phone } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { DemoBadge } from "@/components/auth/demo-badge";
import { DialLink } from "@/components/emergency/dial-link";
import { isDemoMode } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";

/** Shared frame for sign-in flows. "Call 112" stays visible for anyone in danger right now. */
export async function AuthShell({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col bg-ground lg:grid lg:grid-cols-[1fr_minmax(480px,560px)]">
      <aside className="hidden flex-col justify-between bg-navy-900 p-12 text-white lg:flex">
        <Link href="/" className="on-dark w-fit">
          <Logo onDark />
        </Link>
        <div className="max-w-md">
          <p className="text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em]">{t("landing.heroTitle")}</p>
          <p className="mt-4 text-lg leading-relaxed text-navy-300">{t("landing.heroSubtitle")}</p>
        </div>
        <p className="text-sm text-navy-300">{t("auth.privacyLine")}</p>
      </aside>
      <main id="main" className="flex flex-1 flex-col">
        <div className="flex items-center justify-between bg-navy-900 px-4 py-3 lg:bg-transparent lg:px-10 lg:pt-8">
          <Link href="/" className="on-dark lg:invisible">
            <Logo onDark />
          </Link>
          <DialLink number="112" demo={isDemoMode()} className="on-dark inline-flex min-h-11 items-center gap-2 rounded-full bg-sos px-4 text-sm font-bold text-white hover:bg-sos-hover">
            <Phone className="size-4" aria-hidden />
            {t("auth.inDanger")}
          </DialLink>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10 lg:px-0">
          {isDemoMode() ? <DemoBadge /> : null}
          <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.02em]">{title}</h1>
          {description ? <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{description}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
