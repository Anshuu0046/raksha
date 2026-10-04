import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

export const CONTACT_EMAIL = "rakshaalerts@gmail.com";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="bg-ground">
      <header className="bg-navy-900 pt-safe text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/" className="on-dark inline-flex items-center gap-2" aria-label="Raksha">
            <LogoMark tone="white" className="size-7" />
            <span className="text-lg font-extrabold tracking-[-0.03em]">Raksha</span>
          </Link>
          <nav className="flex gap-5 text-sm font-semibold text-navy-200">
            <Link href="/privacy" className="on-dark hover:text-white">Privacy</Link>
            <Link href="/terms" className="on-dark hover:text-white">Terms</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
        <h1 className="text-[clamp(32px,6vw,44px)] font-extrabold leading-tight tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-sm text-ink-3">Last updated {updated}</p>
        <div className="mt-8 space-y-8 text-[16px] leading-relaxed text-ink-2 [&_a]:font-semibold [&_a]:text-navy-900 [&_a]:underline [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:tracking-[-0.02em] [&_h2]:text-ink [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
          {children}
        </div>
      </main>
    </div>
  );
}
