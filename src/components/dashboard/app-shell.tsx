"use client";

import { Clock3, House, MapPinned, PhoneCall, Route, Settings, ShieldCheck, Users, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark, Logo } from "@/components/brand/logo";
import { CallButton } from "@/components/emergency/call-button";
import { EmergencyLayer } from "@/components/emergency/emergency-layer";
import { useAppData } from "@/components/providers/app-data-provider";
import { useOnline } from "@/hooks/use-online";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", key: "nav.home", icon: House, exact: true },
  { href: "/app/help", key: "nav.help", icon: MapPinned },
  { href: "/app/contacts", key: "nav.contacts", icon: Users },
  { href: "/app/journey", key: "nav.journey", icon: Route },
  { href: "/app/history", key: "nav.history", icon: Clock3 },
] as const;

const SECONDARY = [
  { href: "/app/helplines", key: "nav.helplines", icon: PhoneCall },
  { href: "/app/settings", key: "nav.settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  if (href === "/app/help") return pathname.startsWith("/app/help") || pathname.startsWith("/app/helplines");
  return pathname.startsWith(href);
}

export function DemoStrip() {
  const t = useT();
  return (
    <div className="relative z-30 bg-warn px-4 py-1.5 text-center text-[13px] font-bold uppercase tracking-[0.08em] text-white">
      {t("demo.badge")} <span className="font-semibold normal-case tracking-normal">· {t("demo.strip")}</span>
    </div>
  );
}

function OfflineBar() {
  const t = useT();
  const { primary, demo } = useAppData();
  return (
    <div role="alert" className="z-30 flex flex-wrap items-center justify-between gap-3 bg-navy-950 px-4 py-3 text-white">
      <span className="flex items-center gap-2.5">
        <WifiOff className="size-5 shrink-0" aria-hidden />
        <span>
          <span className="block font-bold">{t("offline.title")}</span>
          <span className="block text-sm text-navy-300">{t("offline.callDirectly")}</span>
        </span>
      </span>
      <CallButton number={primary.emergency} label={`${t("helplines.call")} ${primary.emergency}`} emergencyService demo={demo} variant="sos" size="md" />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  const online = useOnline();
  const { demo, user } = useAppData();
  const home = pathname === "/app";

  return (
    <div className={cn("flex min-h-dvh flex-col", home ? "bg-navy-900" : "bg-ground")}>
      {demo ? <DemoStrip /> : null}
      {!online ? <OfflineBar /> : null}

      <div className="flex flex-1">
        {/* Desktop rail */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-white/5 bg-navy-950 px-4 py-6 text-white lg:flex">
          <Link href="/app" className="on-dark mb-8 px-2">
            <Logo onDark />
          </Link>
          <nav aria-label={t("nav.label")} className="flex flex-col gap-1">
            {[...NAV, ...SECONDARY].map((item) => {
              const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "on-dark flex h-12 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] font-semibold transition-colors",
                    active ? "bg-white text-navy-900" : "text-navy-200 hover:bg-white/8 hover:text-white",
                  )}
                >
                  <item.icon className="size-5" aria-hidden />
                  {t(item.key)}
                </Link>
              );
            })}
            {user.role === "admin" ? (
              <Link href="/admin" className="on-dark mt-4 flex h-12 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] font-semibold text-navy-300 hover:bg-white/8 hover:text-white">
                <ShieldCheck className="size-5" aria-hidden />
                {t("nav.admin")}
              </Link>
            ) : null}
          </nav>
          <p className="mt-auto px-2 text-xs leading-relaxed text-navy-300">{t("shell.hardwareNote")}</p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar on inner pages */}
          {!home ? (
            <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-navy-900 px-2 pl-4 text-white lg:hidden">
              <Link href="/app" className="on-dark inline-flex items-center gap-2" aria-label={t("nav.home")}>
                <LogoMark tone="white" className="size-6" />
                <span className="text-lg font-extrabold tracking-[-0.03em]">Raksha</span>
              </Link>
              <div className="flex items-center">
                <Link href="/app/helplines" className="on-dark grid size-12 place-items-center rounded-full hover:bg-white/10" aria-label={t("nav.helplines")}>
                  <PhoneCall className="size-5" aria-hidden />
                </Link>
                <Link href="/app/settings" className="on-dark grid size-12 place-items-center rounded-full hover:bg-white/10" aria-label={t("nav.settings")}>
                  <Settings className="size-5" aria-hidden />
                </Link>
              </div>
            </header>
          ) : null}

          <main id="main" className={cn("flex-1 pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0", !home && "px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10")}>
            {children}
          </main>
        </div>
      </div>

      {/* Mobile tab bar */}
      <nav
        aria-label={t("nav.label")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-navy-950 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("on-dark flex h-[68px] flex-col items-center justify-center gap-1 text-[11.5px] font-semibold", active ? "text-white" : "text-navy-300")}
                >
                  <span className={cn("grid h-8 w-14 place-items-center rounded-full transition-colors", active && "bg-white/14")}>
                    <item.icon className="size-[22px]" aria-hidden strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {t(item.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <EmergencyLayer />
    </div>
  );
}
