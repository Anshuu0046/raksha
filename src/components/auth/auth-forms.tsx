"use client";

import { Mail, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { api, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/client";
import type { PublicUser } from "@/types";

type FieldErrors = Record<string, string>;

function fieldErrors(err: ClientApiError): FieldErrors {
  const out: FieldErrors = {};
  if (Array.isArray(err.details)) for (const d of err.details as Array<{ path: string; message: string }>) out[d.path] ??= d.message;
  return out;
}

function GoogleButton({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  if (!enabled) return null;
  return (
    <Button asChild variant="outline" size="lg" block>
      <a href="/api/auth/google/start">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z" />
          <path fill="#FBBC05" d="M5.4 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.4l4-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.6l4 3.1c.9-2.8 3.5-4.9 6.6-4.9z" />
        </svg>
        {t("auth.continueGoogle")}
      </a>
    </Button>
  );
}

export function LoginForm({ google, phoneOtp }: { google: boolean; phoneOtp: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") ? t(`auth.errors.${params.get("error")}`) : null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {error ? <Notice tone="error" title={error} /> : null}
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const { user } = await api<{ user: PublicUser }>("/api/auth/login", { body: { email, password } });
            router.replace(user.onboardedAt ? "/app" : "/onboarding");
            router.refresh();
          } catch (err) {
            setError((err as ClientApiError).message);
            setBusy(false);
          }
        }}
      >
        <Field id="email" label={t("auth.email")}>
          <Input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="password" label={t("auth.password")}>
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="-mt-2 text-right">
          <Link href="/forgot-password" className="text-sm font-semibold text-navy-700 underline">
            {t("auth.forgot")}
          </Link>
        </div>
        <Button type="submit" size="lg" block loading={busy}>
          <Mail aria-hidden />
          {t("auth.signIn")}
        </Button>
      </form>
      {google || phoneOtp ? <p className="text-center text-sm text-ink-3">{t("auth.or")}</p> : null}
      {phoneOtp ? (
        <Button asChild variant="outline" size="lg" block>
          <Link href="/login/phone">
            <Smartphone aria-hidden />
            {t("auth.continuePhone")}
          </Link>
        </Button>
      ) : null}
      <GoogleButton enabled={google} />
      <p className="text-center text-[15px] text-ink-2">
        {t("auth.noAccount")}{" "}
        <Link href="/signup" className="font-bold text-ink underline">
          {t("auth.createAccount")}
        </Link>
      </p>
    </div>
  );
}

export function SignupForm({ google, phoneOtp }: { google: boolean; phoneOtp: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-5">
      {error ? <Notice tone="error" title={error} /> : null}
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setErrors({});
          try {
            await api("/api/auth/signup", { body: { ...form, locale } });
            router.replace("/onboarding");
            router.refresh();
          } catch (err) {
            const e2 = err as ClientApiError;
            setErrors(fieldErrors(e2));
            setError(e2.code === "VALIDATION_ERROR" ? null : e2.message);
            setBusy(false);
          }
        }}
      >
        <Field id="name" label={t("auth.yourName")} error={errors.name}>
          <Input autoComplete="name" required value={form.name} onChange={set("name")} />
        </Field>
        <Field id="email" label={t("auth.email")} error={errors.email}>
          <Input type="email" autoComplete="email" inputMode="email" required value={form.email} onChange={set("email")} />
        </Field>
        <Field id="password" label={t("auth.password")} hint={t("auth.passwordHint")} error={errors.password}>
          <Input type="password" autoComplete="new-password" required minLength={10} value={form.password} onChange={set("password")} />
        </Field>
        <Button type="submit" size="lg" block loading={busy}>
          {t("auth.createAccount")}
        </Button>
        <p className="text-sm leading-relaxed text-ink-3">
          {t("auth.signupPrivacy")}{" "}
          <a href="/privacy" className="font-semibold underline">Privacy</a> · <a href="/terms" className="font-semibold underline">Terms</a>
        </p>
      </form>
      {google || phoneOtp ? <p className="text-center text-sm text-ink-3">{t("auth.or")}</p> : null}
      {phoneOtp ? (
        <Button asChild variant="outline" size="lg" block>
          <Link href="/login/phone">
            <Smartphone aria-hidden />
            {t("auth.continuePhone")}
          </Link>
        </Button>
      ) : null}
      <GoogleButton enabled={google} />
      <p className="text-center text-[15px] text-ink-2">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="font-bold text-ink underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </div>
  );
}

export function PhoneOtpForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [normalized, setNormalized] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ phone: string; devCode?: string }>("/api/auth/otp/request", { body: { phone } });
      setNormalized(res.phone);
      setDevCode(res.devCode ?? null);
      setStep("code");
    } catch (err) {
      setError((err as ClientApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {error ? <Notice tone="error" title={error} /> : null}
      {step === "phone" ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void requestCode();
          }}
        >
          <Field id="phone" label={t("auth.phone")} hint={t("auth.phoneHint")}>
            <Input type="tel" autoComplete="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
          </Field>
          <Button type="submit" size="lg" block loading={busy}>
            {t("auth.sendCode")}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const { user } = await api<{ user: PublicUser }>("/api/auth/otp/verify", {
                body: { phone: normalized, code, name: name || undefined, locale },
              });
              router.replace(user.onboardedAt ? "/app" : "/onboarding");
              router.refresh();
            } catch (err) {
              const e2 = err as ClientApiError;
              if (e2.code === "VALIDATION_ERROR" && Array.isArray(e2.details) && (e2.details as Array<{ path: string }>).some((d) => d.path === "name")) {
                setNeedsName(true);
              } else setError(e2.message);
              setBusy(false);
            }
          }}
        >
          <p className="text-[15px] text-ink-2">{t("auth.codeSent", { phone: normalized })}</p>
          {devCode ? <Notice tone="warn" title={t("demo.otpCode", { code: devCode })} /> : null}
          <Field id="code" label={t("auth.code")}>
            <Input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="tabular text-center text-2xl tracking-[0.4em]" />
          </Field>
          {needsName ? (
            <Field id="name" label={t("auth.yourName")} hint={t("auth.newAccountName")}>
              <Input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          ) : null}
          <Button type="submit" size="lg" block loading={busy}>
            {needsName ? t("auth.createAccount") : t("auth.verify")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setStep("phone")}>
            {t("auth.changeNumber")}
          </Button>
        </form>
      )}
    </div>
  );
}

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (sent)
    return (
      <Notice tone="success" title={t("auth.reset.sentTitle")} action={sent.devLink ? <a className="font-semibold underline" href={sent.devLink}>{t("demo.openResetLink")}</a> : undefined}>
        {t("auth.reset.sentBody")}
      </Notice>
    );
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          setSent(await api<{ devLink?: string }>("/api/auth/password/forgot", { body: { email } }));
        } catch (err) {
          setError((err as ClientApiError).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {error ? <Notice tone="error" title={error} /> : null}
      <Field id="email" label={t("auth.email")}>
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" block loading={busy}>
        {t("auth.reset.send")}
      </Button>
      <Link href="/login" className="text-center text-sm font-semibold underline">
        {t("auth.backToSignIn")}
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/password/reset", { body: { token, password } });
          router.replace("/app");
          router.refresh();
        } catch (err) {
          setError((err as ClientApiError).message);
          setBusy(false);
        }
      }}
    >
      {error ? <Notice tone="error" title={error} /> : null}
      <Field id="password" label={t("auth.newPassword")} hint={t("auth.passwordHint")}>
        <Input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" block loading={busy}>
        {t("auth.reset.save")}
      </Button>
    </form>
  );
}
