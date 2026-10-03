import { ZodError, type ZodType } from "zod";
import { authenticate, sessionCookieHeader, type AuthContext } from "@/lib/auth/session";
import { appUrl } from "@/lib/env";
import { enforceRateLimit, type RateLimitRule } from "@/lib/security/rate-limit";
import { clientIp, ipHash } from "@/lib/server/request";
import { ApiError, type ApiErrorBody } from "./errors";

const MAX_JSON_BYTES = 64 * 1024;

type AuthMode = "user" | "admin" | "optional" | "none";

export interface RouteContext<P> {
  req: Request;
  params: P;
  auth: AuthContext | null;
  ip: string;
  ipHash: string;
}

export interface AuthedRouteContext<P> extends RouteContext<P> {
  auth: AuthContext;
}

interface RouteOptions {
  auth: AuthMode;
  /** Rate-limit by user id when signed in, otherwise by IP. */
  rateLimit?: RateLimitRule;
}

const noStore = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };

export function json<T>(data: T, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: init.status ?? 200,
    headers: { ...noStore, ...init.headers },
  });
}

export function errorResponse(err: ApiError): Response {
  const body: ApiErrorBody = {
    success: false,
    error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
  };
  return new Response(JSON.stringify(body), { status: err.status, headers: { ...noStore, ...err.headers } });
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) {
    return new ApiError(
      "VALIDATION_ERROR",
      err.issues[0]?.message ?? "Some fields are invalid.",
      err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  // Never leak internals: log server-side, return a generic message.
  console.error("[raksha] unhandled API error:", err);
  return new ApiError("INTERNAL_ERROR", "Something went wrong on our side. Please try again.");
}

/**
 * Cookie-authenticated, state-changing requests must come from our own origin (CSRF defence in
 * depth alongside SameSite=Lax). Bearer-token clients (Android) are not subject to CSRF.
 */
function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(appUrl()).origin, new URL(req.url).origin]);
  if (origin) {
    if (!allowed.has(origin)) throw new ApiError("CSRF_REJECTED", "Cross-site request blocked.");
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new ApiError("CSRF_REJECTED", "Cross-site request blocked.");
  }
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_JSON_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", "Request body is too large.");
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_JSON_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", "Request body is too large.");
    raw = text ? JSON.parse(text) : {};
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("INVALID_JSON", "Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

export function readQuery<T>(req: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  return schema.parse(params);
}

type Handler<C> = (ctx: C) => Promise<Response | unknown>;
type NextHandler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;

export function route<P = Record<string, never>>(
  options: RouteOptions & { auth: "user" | "admin" },
  handler: Handler<AuthedRouteContext<P>>,
): NextHandler<P>;
export function route<P = Record<string, never>>(
  options: RouteOptions & { auth: "optional" | "none" },
  handler: Handler<RouteContext<P>>,
): NextHandler<P>;
// Implementation: an AuthedRouteContext handler accepts both overloads (it extends RouteContext).
export function route<P>(options: RouteOptions, handler: Handler<AuthedRouteContext<P>>): NextHandler<P> {
  return async (req, ctx) => {
    try {
      const params = (ctx?.params ? await ctx.params : {}) as P;
      const auth = options.auth === "none" ? null : await authenticate(req);
      if ((options.auth === "user" || options.auth === "admin") && !auth) {
        throw new ApiError("UNAUTHENTICATED", "Please sign in to continue.");
      }
      if (options.auth === "admin" && auth?.user.role !== "admin") {
        throw new ApiError("FORBIDDEN", "You do not have access to this resource.");
      }
      const method = req.method.toUpperCase();
      if (method !== "GET" && method !== "HEAD" && auth?.via === "cookie") assertSameOrigin(req);
      if (options.rateLimit) {
        await enforceRateLimit(options.rateLimit, auth ? `u:${auth.user.id}` : `ip:${clientIp(req)}`);
      }

      const result = await handler({ req, params, auth, ip: clientIp(req), ipHash: ipHash(req) } as AuthedRouteContext<P>);
      const response = result instanceof Response ? result : json(result);
      if (auth?.refreshedToken && !response.headers.has("set-cookie")) {
        response.headers.append("Set-Cookie", sessionCookieHeader(auth.refreshedToken));
      }
      return response;
    } catch (err) {
      return errorResponse(toApiError(err));
    }
  };
}
