import { ApiError } from "@/lib/api/errors";
import { getRepository } from "@/lib/db";
import { appUrl, isDemoMode, serverEnv } from "@/lib/env";
import { isLocale } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/dictionaries";
import { getEmailProvider } from "@/lib/notifications/providers/email";
import { getSmsProvider } from "@/lib/notifications/providers/sms";
import { audit } from "@/lib/security/audit";
import { generateOtp, generateToken, hashToken, hmac, safeEqual } from "@/lib/security/tokens";
import { DEFAULT_PREFERENCES, type User } from "@/types";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./password";

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TTL_MS = 30 * 60_000;

function roleFor(email: string | null): User["role"] {
  return email && serverEnv.adminEmails().includes(email.toLowerCase()) ? "admin" : "user";
}

async function syncAdminRole(user: User): Promise<User> {
  const role = roleFor(user.email);
  if (role === "admin" && user.role !== "admin") return getRepository().updateUser(user.id, { role });
  return user;
}

export async function signupWithPassword(input: { name: string; email: string; password: string; locale?: string }): Promise<User> {
  const repo = getRepository();
  if (await repo.getUserByEmail(input.email)) {
    throw new ApiError("EMAIL_IN_USE", "An account with this email already exists. Try signing in.");
  }
  const user = await repo.createUser({
    email: input.email,
    phone: null,
    name: input.name,
    role: roleFor(input.email),
    locale: isLocale(input.locale) ? input.locale : "en",
    passwordHash: await hashPassword(input.password),
    googleSub: null,
    preferences: { ...DEFAULT_PREFERENCES },
    avatarUrl: null,
    onboardedAt: null,
  });
  await audit({ userId: user.id, actor: "user", action: "auth.signup", metadata: { method: "password" } });
  return user;
}

export async function loginWithPassword(email: string, password: string): Promise<User> {
  const user = await getRepository().getUserByEmail(email);
  // Verify against a dummy hash when the account does not exist so timing does not reveal accounts.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyPasswordHash()));
  if (!user || !user.passwordHash || !ok) {
    throw new ApiError("INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  await audit({ userId: user.id, actor: "user", action: "auth.login", metadata: { method: "password" } });
  return syncAdminRole(user);
}

// ------------------------------------------------------------------ Phone OTP

export function otpAvailable(): boolean {
  return isDemoMode() || Boolean(serverEnv.smsProvider());
}

/** Sends a 6-digit code. In demo mode the code is returned so the flow can be shown without SMS. */
export async function requestOtp(phone: string, locale = "en"): Promise<{ devCode?: string }> {
  if (!otpAvailable()) throw new ApiError("PROVIDER_NOT_CONFIGURED", "Phone sign-in is not available yet. Use email instead.");
  const repo = getRepository();
  const code = generateOtp();
  await repo.createOtp({
    phone,
    codeHash: hmac(`${phone}:${code}`, "otp"),
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    attempts: 0,
    consumedAt: null,
  });
  const t = await getTranslator(locale);
  const result = await getSmsProvider().send({
    to: phone,
    body: t("notify.otp", { code }),
    template: "otp",
    vars: { otp: code },
  });
  if (result.status === "failed" || result.status === "skipped") {
    throw new ApiError("UPSTREAM_UNAVAILABLE", "We could not send the code. Please try again or use email.");
  }
  return isDemoMode() ? { devCode: code } : {};
}

export async function verifyOtp(phone: string, code: string, name?: string, locale?: string): Promise<{ user: User; created: boolean }> {
  const repo = getRepository();
  const otp = await repo.getLatestOtp(phone);
  if (!otp || otp.consumedAt) throw new ApiError("OTP_INVALID", "That code is not valid. Request a new one.");
  if (new Date(otp.expiresAt).getTime() < Date.now()) throw new ApiError("OTP_EXPIRED", "That code has expired. Request a new one.");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new ApiError("OTP_INVALID", "Too many attempts. Request a new code.");
  if (!safeEqual(otp.codeHash, hmac(`${phone}:${code}`, "otp"))) {
    await repo.updateOtp(otp.id, { attempts: otp.attempts + 1 });
    throw new ApiError("OTP_INVALID", "That code is not correct.");
  }
  await repo.updateOtp(otp.id, { consumedAt: new Date().toISOString() });

  const existing = await repo.getUserByPhone(phone);
  if (existing) {
    await audit({ userId: existing.id, actor: "user", action: "auth.login", metadata: { method: "otp" } });
    return { user: existing, created: false };
  }
  if (!name) throw new ApiError("VALIDATION_ERROR", "Tell us your name to create your account.", [{ path: "name", message: "Required" }]);
  const user = await repo.createUser({
    email: null,
    phone,
    name,
    role: "user",
    locale: isLocale(locale) ? locale : "en",
    passwordHash: null,
    googleSub: null,
    preferences: { ...DEFAULT_PREFERENCES },
    avatarUrl: null,
    onboardedAt: null,
  });
  await audit({ userId: user.id, actor: "user", action: "auth.signup", metadata: { method: "otp" } });
  return { user, created: true };
}

// ------------------------------------------------------------------ Password reset

export async function requestPasswordReset(email: string): Promise<{ devLink?: string }> {
  const repo = getRepository();
  const user = await repo.getUserByEmail(email);
  // Same response whether or not the account exists (no account enumeration).
  if (!user) return {};
  const token = generateToken();
  await repo.createAuthToken({
    userId: user.id,
    purpose: "password_reset",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    consumedAt: null,
  });
  const link = `${appUrl()}/reset-password?token=${token}`;
  const t = await getTranslator(user.locale);
  await getEmailProvider().send({
    to: email,
    subject: t("auth.reset.emailSubject"),
    text: t("auth.reset.emailBody", { link }),
    html: `<p>${t("auth.reset.emailBody", { link: `<a href="${link}">${link}</a>` })}</p>`,
  });
  await audit({ userId: user.id, actor: "user", action: "auth.reset_requested" });
  return isDemoMode() ? { devLink: link } : {};
}

export async function resetPassword(token: string, password: string): Promise<User> {
  const repo = getRepository();
  const record = await repo.getAuthTokenByHash(hashToken(token));
  if (!record || record.consumedAt || record.purpose !== "password_reset" || new Date(record.expiresAt).getTime() < Date.now()) {
    throw new ApiError("TOKEN_EXPIRED", "This reset link is invalid or has expired. Request a new one.");
  }
  await repo.consumeAuthToken(record.id, new Date().toISOString());
  const user = await repo.updateUser(record.userId, { passwordHash: await hashPassword(password) });
  // Sign out everywhere: whoever had the old password loses access.
  await repo.revokeUserSessions(user.id);
  await audit({ userId: user.id, actor: "user", action: "auth.password_reset" });
  return user;
}

// ------------------------------------------------------------------ Google

export async function upsertGoogleUser(profile: { sub: string; email: string | null; emailVerified: boolean; name: string; picture: string | null }): Promise<User> {
  const repo = getRepository();
  const bySub = await repo.getUserByGoogleSub(profile.sub);
  if (bySub) return syncAdminRole(bySub);
  if (profile.email && profile.emailVerified) {
    const byEmail = await repo.getUserByEmail(profile.email);
    if (byEmail) return syncAdminRole(await repo.updateUser(byEmail.id, { googleSub: profile.sub }));
  }
  if (!profile.email) throw new ApiError("VALIDATION_ERROR", "Your Google account did not share an email address.");
  const user = await repo.createUser({
    email: profile.email,
    phone: null,
    name: profile.name.slice(0, 80) || "Raksha user",
    role: roleFor(profile.email),
    locale: "en",
    passwordHash: null,
    googleSub: profile.sub,
    preferences: { ...DEFAULT_PREFERENCES },
    avatarUrl: profile.picture,
    onboardedAt: null,
  });
  await audit({ userId: user.id, actor: "user", action: "auth.signup", metadata: { method: "google" } });
  return user;
}

export function googleLoginEnabled(): boolean {
  return Boolean(serverEnv.googleClientId() && serverEnv.googleClientSecret());
}
