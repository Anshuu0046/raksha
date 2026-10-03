import { describe, expect, it } from "vitest";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { POST as otpRequestRoute } from "@/app/api/auth/otp/request/route";
import { POST as otpVerifyRoute } from "@/app/api/auth/otp/verify/route";
import { POST as forgotRoute } from "@/app/api/auth/password/forgot/route";
import { POST as resetRoute } from "@/app/api/auth/password/reset/route";
import { POST as signupRoute } from "@/app/api/auth/signup/route";
import { GET as meRoute } from "@/app/api/me/route";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getRepository } from "@/lib/db";
import { call, sessionTokenFrom } from "./helpers";

const creds = { name: "Ananya Test", email: "ananya@raksha.test", password: "correct-horse-battery" };

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("s3cret-password");
    const b = await hashPassword("s3cret-password");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("s3cret-password", a)).toBe(true);
    expect(await verifyPassword("wrong-password", a)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });
});

describe("authentication", () => {
  it("signs up, sets an httpOnly session cookie, and never returns credentials", async () => {
    const res = await call<{ user: Record<string, unknown> }>(signupRoute, "/api/auth/signup", { body: creds });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(res.data.user).not.toHaveProperty("passwordHash");
    expect(res.data.user).toMatchObject({ email: creds.email, hasPassword: true });
    const me = await call<{ user: { name: string } }>(meRoute, "/api/me", { token: sessionTokenFrom(res) });
    expect(me.data.user.name).toBe("Ananya Test");
  });

  it("rejects duplicate emails", async () => {
    await call(signupRoute, "/api/auth/signup", { body: creds });
    const dup = await call(signupRoute, "/api/auth/signup", { body: { ...creds, email: "ANANYA@raksha.test" } });
    expect(dup.status).toBe(409);
    expect(dup.json).toMatchObject({ error: { code: "EMAIL_IN_USE" } });
  });

  it("logs in with the right password only, with one generic error", async () => {
    await call(signupRoute, "/api/auth/signup", { body: creds });
    const bad = await call(loginRoute, "/api/auth/login", { body: { email: creds.email, password: "nope-nope-nope" } });
    const unknown = await call(loginRoute, "/api/auth/login", { body: { email: "who@raksha.test", password: "nope-nope-nope" } });
    expect(bad.status).toBe(401);
    expect(unknown.json).toEqual(bad.json);
    const ok = await call(loginRoute, "/api/auth/login", { body: { email: creds.email, password: creds.password } });
    expect(ok.status).toBe(200);
  });

  it("issues a bearer token for the Android client", async () => {
    const res = await call<{ token: string }>(signupRoute, "/api/auth/signup", { body: { ...creds, client: "android" } });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const me = await call(meRoute, "/api/me", { bearer: res.data.token });
    expect(me.status).toBe(200);
  });

  it("logout revokes the session server-side", async () => {
    const res = await call(signupRoute, "/api/auth/signup", { body: creds });
    const token = sessionTokenFrom(res);
    await call(logoutRoute, "/api/auth/logout", { method: "POST", token });
    const me = await call(meRoute, "/api/me", { token });
    expect(me.status).toBe(401);
    expect(me.json).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("phone OTP: sends a code (demo returns it), verifies, creates the account once", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    const req = await call<{ devCode: string; phone: string }>(otpRequestRoute, "/api/auth/otp/request", { body: { phone: "98765 43210" } });
    expect(req.data.phone).toBe("+919876543210");
    const wrong = await call(otpVerifyRoute, "/api/auth/otp/verify", { body: { phone: "+919876543210", code: "000000" === req.data.devCode ? "111111" : "000000", name: "Ananya" } });
    expect(wrong.status).toBe(400);
    const ok = await call<{ created: boolean }>(otpVerifyRoute, "/api/auth/otp/verify", { body: { phone: "+919876543210", code: req.data.devCode, name: "Ananya" } });
    expect(ok.data.created).toBe(true);
    const reuse = await call(otpVerifyRoute, "/api/auth/otp/verify", { body: { phone: "+919876543210", code: req.data.devCode } });
    expect(reuse.status).toBe(400); // codes are single-use
  });

  it("phone OTP is unavailable without an SMS provider", async () => {
    const res = await call(otpRequestRoute, "/api/auth/otp/request", { body: { phone: "9876543210" } });
    expect(res.status).toBe(501);
    expect(res.json).toMatchObject({ error: { code: "PROVIDER_NOT_CONFIGURED" } });
  });

  it("password reset: single-use link, signs out other sessions", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    const signup = await call(signupRoute, "/api/auth/signup", { body: creds });
    const oldToken = sessionTokenFrom(signup);
    const forgot = await call<{ devLink: string }>(forgotRoute, "/api/auth/password/forgot", { body: { email: creds.email } });
    const resetToken = new URL(forgot.data.devLink).searchParams.get("token")!;
    const reset = await call(resetRoute, "/api/auth/password/reset", { body: { token: resetToken, password: "a-brand-new-password" } });
    expect(reset.status).toBe(200);
    expect((await call(meRoute, "/api/me", { token: oldToken })).status).toBe(401);
    const again = await call(resetRoute, "/api/auth/password/reset", { body: { token: resetToken, password: "another-new-password" } });
    expect(again.status).toBe(410);
    // Unknown emails get the same response (no account enumeration).
    const unknown = await call(forgotRoute, "/api/auth/password/forgot", { body: { email: "nobody@raksha.test" } });
    expect(unknown.data).toEqual({ sent: true });
  });

  it("promotes ADMIN_EMAILS accounts to admin", async () => {
    process.env.ADMIN_EMAILS = "boss@raksha.test";
    const res = await call<{ user: { role: string } }>(signupRoute, "/api/auth/signup", { body: { ...creds, email: "boss@raksha.test" } });
    expect(res.data.user.role).toBe("admin");
    delete process.env.ADMIN_EMAILS;
    expect((await getRepository().getUserByEmail("boss@raksha.test"))!.role).toBe("admin");
  });
});
