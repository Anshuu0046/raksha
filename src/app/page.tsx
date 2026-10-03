import { AlarmClock, Hospital, Link2, ListChecks, MapPin, Navigation, PhoneCall, ShieldCheck, Siren, Smartphone, Users } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { DialLink } from "@/components/emergency/dial-link";
import { LandingDemo } from "@/components/landing/landing-demo";
import { LanguageSelect } from "@/components/landing/language-select";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/server";
import { isDemoMode } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";

export default async function LandingPage() {
  const { t } = await getI18n();
  const demo = isDemoMode();
  const user = await getCurrentUser();
  const primaryHref = user ? "/app" : "/signup";

  const emergencyFeatures = [
    { icon: Siren, title: t("landing.f.sos"), body: t("landing.f.sosBody") },
    { icon: Users, title: t("landing.f.contacts"), body: t("landing.f.contactsBody") },
    { icon: Link2, title: t("landing.f.live"), body: t("landing.f.liveBody") },
    { icon: MapPin, title: t("landing.f.police"), body: t("landing.f.policeBody") },
    { icon: Hospital, title: t("landing.f.hospitals"), body: t("landing.f.hospitalsBody") },
    { icon: PhoneCall, title: t("landing.f.helplines"), body: t("landing.f.helplinesBody") },
  ];
  const dailyFeatures = [
    { icon: Navigation, title: t("landing.f.journey"), body: t("landing.f.journeyBody") },
    { icon: AlarmClock, title: t("landing.f.checkin"), body: t("landing.f.checkinBody") },
  ];
  const steps = [
    { n: "01", title: t("landing.how.s1"), body: t("landing.how.s1Body"), icon: Siren },
    { n: "02", title: t("landing.how.s2"), body: t("landing.how.s2Body"), icon: Users },
    { n: "03", title: t("landing.how.s3"), body: t("landing.how.s3Body"), icon: MapPin },
  ];

  return (
    <div className="bg-ground">
      {demo ? (
        <p className="bg-warn px-4 py-1.5 text-center text-[13px] font-bold uppercase tracking-[0.08em] text-white">{t("demo.badge")}</p>
      ) : null}
      <header className="bg-navy-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link href="/" className="on-dark" aria-label="Raksha">
            <Logo onDark />
          </Link>
          <nav aria-label={t("landing.navLabel")} className="hidden items-center gap-6 text-[15px] font-semibold text-navy-200 md:flex">
            <a href="#how" className="on-dark hover:text-white">{t("landing.howItWorks")}</a>
            <a href="#features" className="on-dark hover:text-white">{t("landing.features")}</a>
            <a href="#honest" className="on-dark hover:text-white">{t("landing.honestNav")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <DialLink number="112" demo={demo} className="on-dark hidden min-h-11 items-center gap-2 rounded-full bg-sos px-4 text-sm font-bold hover:bg-sos-hover sm:inline-flex">
              <PhoneCall className="size-4" aria-hidden />
              {t("auth.inDanger")}
            </DialLink>
            {user ? (
              <Button asChild variant="onDark" size="sm">
                <Link href="/app">{t("landing.openApp")}</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="onDark" size="sm">
                  <Link href="/login">{t("auth.signIn")}</Link>
                </Button>
                <Button asChild variant="sos" size="sm">
                  <Link href="/signup">{t("landing.getStarted")}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero: the thesis and the mechanism, side by side */}
        <section className="bg-navy-900 pb-16 text-white sm:pb-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 sm:px-8 lg:grid-cols-[1fr_auto] lg:pt-16">
            <div className="max-w-xl">
              <h1 className="text-[clamp(44px,8vw,76px)] font-extrabold leading-[0.98] tracking-[-0.035em]">{t("landing.heroTitle")}</h1>
              <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-navy-200 sm:text-xl">{t("landing.heroSubtitle")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="xl" variant="sos">
                  <Link href={primaryHref}>{user ? t("landing.openApp") : t("landing.getStarted")}</Link>
                </Button>
                <Button asChild size="xl" variant="onDark">
                  <a href="#how">{t("landing.howItWorks")}</a>
                </Button>
              </div>
              <p className="mt-6 text-[15px] text-navy-300">{t("landing.heroNote")}</p>
            </div>
            <LandingDemo />
          </div>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-title" className="scroll-mt-4 px-4 py-20 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 id="how-title" className="max-w-[18ch] text-[clamp(32px,5vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em]">{t("landing.how.title")}</h2>
            <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              <span className="absolute left-[27px] top-14 hidden h-[calc(100%-56px)] w-px bg-line-strong max-md:block" aria-hidden />
              <span className="absolute left-14 right-14 top-7 hidden h-px bg-line-strong md:block" aria-hidden />
              {steps.map((s, i) => (
                <li key={s.n} className="relative flex gap-5 md:flex-col">
                  <span className={`relative z-10 grid size-14 shrink-0 place-items-center rounded-full ${i === 0 ? "bg-sos text-white" : "bg-navy-900 text-white"}`}>
                    <s.icon className="size-6" aria-hidden />
                  </span>
                  <div>
                    <p className="tabular text-sm font-bold text-ink-3">{s.n}</p>
                    <h3 className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.02em]">{s.title}</h3>
                    <p className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-ink-2">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features as a specification, not a card grid */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-4 border-t border-line bg-surface px-4 py-20 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 id="features-title" className="max-w-[20ch] text-[clamp(32px,5vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em]">{t("landing.featuresTitle")}</h2>
            <div className="mt-12 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.08em] text-sos-ink">{t("landing.inEmergency")}</h3>
                <dl className="divide-y divide-line border-y border-line">
                  {emergencyFeatures.map((f) => (
                    <div key={f.title} className="grid gap-1 py-5 sm:grid-cols-[220px_1fr] sm:gap-6">
                      <dt className="flex items-center gap-3 text-[17px] font-bold">
                        <f.icon className="size-5 text-sos" aria-hidden />
                        {f.title}
                      </dt>
                      <dd className="text-[15px] leading-relaxed text-ink-2 sm:pl-0 pl-8">{f.body}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.08em] text-safe-ink">{t("landing.everyDay")}</h3>
                <dl className="divide-y divide-line border-y border-line">
                  {dailyFeatures.map((f) => (
                    <div key={f.title} className="py-5">
                      <dt className="flex items-center gap-3 text-[17px] font-bold">
                        <f.icon className="size-5 text-safe" aria-hidden />
                        {f.title}
                      </dt>
                      <dd className="mt-1 pl-8 text-[15px] leading-relaxed text-ink-2">{f.body}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-6 flex items-start gap-3 text-[15px] leading-relaxed text-ink-2">
                  <ListChecks className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
                  {t("landing.languages")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Honesty: what a website can and cannot do */}
        <section id="honest" aria-labelledby="honest-title" className="scroll-mt-4 px-4 py-20 sm:px-8">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2">
            <div>
              <h2 id="honest-title" className="text-[clamp(28px,4vw,40px)] font-extrabold leading-[1.08] tracking-[-0.03em]">{t("landing.honest.title")}</h2>
              <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-2">{t("landing.honest.body")}</p>
            </div>
            <ul className="flex flex-col gap-4 text-[15px] leading-relaxed">
              {[
                { icon: ShieldCheck, text: t("landing.honest.p1") },
                { icon: Link2, text: t("landing.honest.p2") },
                { icon: Smartphone, text: t("landing.honest.p3") },
                { icon: PhoneCall, text: t("landing.honest.p4") },
              ].map((p) => (
                <li key={p.text} className="flex gap-3">
                  <p.icon className="mt-0.5 size-5 shrink-0 text-navy-700" aria-hidden />
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Helplines band */}
        <section aria-labelledby="numbers-title" className="bg-navy-950 px-4 py-14 text-white sm:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <h2 id="numbers-title" className="max-w-[22ch] text-2xl font-extrabold tracking-[-0.02em]">{t("landing.numbersTitle")}</h2>
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { n: "112", l: t("landing.numbers.112") },
                { n: "181", l: t("landing.numbers.181") },
                { n: "1091", l: t("landing.numbers.1091") },
                { n: "1098", l: t("landing.numbers.1098") },
              ].map((x) => (
                <li key={x.n}>
                  <DialLink number={x.n} demo={demo} className={`on-dark flex min-h-16 flex-col justify-center rounded-[var(--radius-control)] px-4 py-2 ${x.n === "112" ? "bg-sos hover:bg-sos-hover" : "bg-white/8 hover:bg-white/14"}`}>
                    <span className="tabular text-xl font-extrabold">{x.n}</span>
                    <span className="text-xs text-white/80">{x.l}</span>
                  </DialLink>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 py-20 text-center sm:px-8">
          <h2 className="mx-auto max-w-[20ch] text-[clamp(30px,5vw,44px)] font-extrabold leading-[1.05] tracking-[-0.03em]">{t("landing.closeTitle")}</h2>
          <p className="mx-auto mt-4 max-w-[50ch] text-[17px] text-ink-2">{t("landing.closeBody")}</p>
          <Button asChild size="xl" variant="sos" className="mt-8">
            <Link href={primaryHref}>{user ? t("landing.openApp") : t("landing.getStarted")}</Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>{t("landing.footer")}</p>
          <LanguageSelect />
        </div>
      </footer>
    </div>
  );
}
