import { getRepository } from "@/lib/db";
import { setNotificationProvidersForTesting } from "@/lib/notifications/dispatcher";
import type { DeliveryResult, EmailMessage, PushMessage, PushTarget, SmsMessage } from "@/lib/notifications/types";
import { flushBackground } from "@/lib/server/background";
import { DEFAULT_PREFERENCES, type User } from "@/types";

export const ORIGIN = "http://localhost:3000";

// Promise<never> is assignable to any Promise<P>, so this accepts every route handler.
type Handler = (req: Request, ctx: { params: Promise<never> }) => Promise<Response>;

export interface CallOptions {
  method?: string;
  body?: unknown;
  rawBody?: string;
  token?: string;
  bearer?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  ip?: string;
}

/** Invokes a Next.js route handler directly with a constructed Request. */
export async function call<T = unknown>(handler: Handler, path: string, opts: CallOptions = {}) {
  const url = new URL(path, ORIGIN);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const headers = new Headers(opts.headers);
  if (opts.body !== undefined || opts.rawBody !== undefined) headers.set("content-type", "application/json");
  if (opts.token) headers.set("cookie", `raksha_session=${opts.token}`);
  if (opts.bearer) headers.set("authorization", `Bearer ${opts.bearer}`);
  if (!headers.has("origin") && opts.method && opts.method !== "GET") headers.set("origin", ORIGIN);
  headers.set("x-forwarded-for", opts.ip ?? "203.0.113.7");
  const req = new Request(url, {
    method: opts.method ?? (opts.body !== undefined || opts.rawBody !== undefined ? "POST" : "GET"),
    headers,
    body: opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) as Promise<never> });
  await flushBackground();
  const json = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string; details?: unknown } }
    | null;
  return { status: res.status, json, headers: res.headers, data: json && json.success ? json.data : (undefined as T) };
}

export function sessionTokenFrom(res: { headers: Headers }): string {
  const cookie = res.headers.get("set-cookie") ?? "";
  const match = cookie.match(/raksha_session=([^;]+)/);
  if (!match) throw new Error(`No session cookie in: ${cookie}`);
  return match[1]!;
}

/** Creates a user directly in the repository (fast: skips password hashing). */
export async function makeUser(overrides: Partial<User> = {}): Promise<User> {
  return getRepository().createUser({
    email: `user-${Math.random().toString(36).slice(2)}@raksha.test`,
    phone: "+919000000001",
    name: "Ananya Test",
    role: "user",
    locale: "en",
    passwordHash: null,
    googleSub: null,
    preferences: { ...DEFAULT_PREFERENCES },
    avatarUrl: null,
    onboardedAt: new Date().toISOString(),
    ...overrides,
  });
}

export async function makeSession(user: User): Promise<string> {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(user, "web", new Request(ORIGIN));
  return token;
}

export async function makeContact(user: User, overrides: Partial<Parameters<ReturnType<typeof getRepository>["createContact"]>[0]> = {}) {
  return getRepository().createContact({
    userId: user.id,
    name: "Meera Test",
    phone: "+919876543210",
    email: "meera@raksha.test",
    relationship: "mother",
    customRelationship: null,
    locale: "en",
    notifySms: true,
    notifyEmail: true,
    notifyPush: true,
    isPrimary: false,
    alertTokenHash: null,
    ...overrides,
  });
}

/** Recording fake providers: every send is captured; outcomes can be scripted. */
export function fakeProviders(script: { sms?: DeliveryResult["status"][]; email?: DeliveryResult["status"][] } = {}) {
  const sent = { sms: [] as SmsMessage[], email: [] as EmailMessage[], push: [] as Array<{ target: PushTarget; message: PushMessage }> };
  const smsScript = [...(script.sms ?? [])];
  const emailScript = [...(script.email ?? [])];
  setNotificationProvidersForTesting({
    sms: {
      name: "fake-sms",
      async send(m) {
        sent.sms.push(m);
        const status = smsScript.shift() ?? "sent";
        return { status, provider: "fake-sms", error: status === "failed" ? "boom" : undefined };
      },
    },
    email: {
      name: "fake-email",
      async send(m) {
        sent.email.push(m);
        const status = emailScript.shift() ?? "sent";
        return { status, provider: "fake-email", error: status === "failed" ? "boom" : undefined };
      },
    },
    push: {
      name: "fake-push",
      async send(target, message) {
        sent.push.push({ target, message });
        return { status: "sent", provider: "fake-push" };
      },
    },
  });
  return sent;
}

export { flushBackground };
