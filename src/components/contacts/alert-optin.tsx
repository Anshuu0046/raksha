"use client";

import { BellRing, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { useT } from "@/lib/i18n/client";
import { pushSupport, subscribeToPush, type PushSupport, type SubscribeResult } from "@/lib/push/client";

export function AlertOptIn({ token, ownerName, valid }: { token: string; ownerName: string | null; valid: boolean }) {
  const t = useT();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [result, setResult] = useState<SubscribeResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(pushSupport());
  }, []);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12">
      <LogoMark className="size-11" />
      {!valid || !ownerName ? (
        <>
          <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.02em]">{t("alertsOptIn.invalidTitle")}</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{t("alertsOptIn.invalidBody")}</p>
        </>
      ) : result === "subscribed" ? (
        <>
          <CheckCircle2 className="mt-6 size-12 text-safe" aria-hidden />
          <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.02em]">{t("alertsOptIn.doneTitle")}</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{t("alertsOptIn.doneBody", { name: ownerName })}</p>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-[32px] font-extrabold leading-tight tracking-[-0.02em]">{t("alertsOptIn.title", { name: ownerName })}</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{t("alertsOptIn.body", { name: ownerName })}</p>
          <div className="mt-8 flex flex-col gap-3">
            {support === "ios-needs-install" ? (
              <Notice tone="info" title={t("push.ios-needs-install")} />
            ) : support === "unsupported" ? (
              <Notice tone="warn" title={t("push.unsupported")}>{t("alertsOptIn.smsStillWorks")}</Notice>
            ) : (
              <Button
                size="xl"
                block
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setResult(await subscribeToPush(`/api/public/alerts/${token}`));
                  setBusy(false);
                }}
              >
                <BellRing aria-hidden />
                {t("alertsOptIn.enable")}
              </Button>
            )}
            {result ? <Notice tone="error" title={t(`push.${result}`)} /> : null}
            <p className="text-sm leading-relaxed text-ink-3">{t("alertsOptIn.privacy")}</p>
          </div>
        </>
      )}
    </main>
  );
}
