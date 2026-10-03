import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { requirePageUser } from "@/lib/auth/server";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { robots: { index: false } };

/** Role-gated: non-admins get a 404 so the admin surface is not even confirmed to exist. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  if (user.role !== "admin") notFound();
  const { t } = await getI18n();
  return (
    <div className="min-h-dvh bg-ground">
      <header className="bg-navy-950 px-4 py-3 text-white sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/admin" className="on-dark inline-flex items-center gap-3">
            <Logo onDark />
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.08em]">{t("admin.badge")}</span>
          </Link>
          <nav aria-label={t("admin.navLabel")} className="flex gap-1 text-sm font-semibold">
            <Link href="/admin" className="on-dark rounded-lg px-3 py-2 hover:bg-white/10">{t("admin.overview")}</Link>
            <Link href="/admin/helplines" className="on-dark rounded-lg px-3 py-2 hover:bg-white/10">{t("nav.helplines")}</Link>
            <Link href="/app" className="on-dark rounded-lg px-3 py-2 text-navy-300 hover:bg-white/10">{t("admin.backToApp")}</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
