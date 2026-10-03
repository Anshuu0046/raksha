import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import { ServiceWorkerRegistrar } from "@/components/pwa/sw-register";
import { appUrl } from "@/lib/env";
import { I18nProvider } from "@/lib/i18n/client";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

const hanken = Hanken_Grotesk({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hanken",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    metadataBase: new URL(appUrl()),
    title: { default: `Raksha · ${t("meta.tagline")}`, template: "%s · Raksha" },
    description: t("meta.description"),
    applicationName: "Raksha",
    appleWebApp: { capable: true, title: "Raksha", statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false },
    icons: {
      icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0d1b2a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dict } = await getI18n();
  return (
    <html lang={locale} className={hanken.variable}>
      <body>
        <>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-ink">
          {(dict.common as Record<string, string> | undefined)?.skipToContent ?? "Skip to content"}
          </a>
          <I18nProvider locale={locale} dict={dict}>
          {children}
          <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)", fontSize: 15 } }} />
          <ServiceWorkerRegistrar />
          </I18nProvider>
        </>
      </body>
    </html>
  );
}