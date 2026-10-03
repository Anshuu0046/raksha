"use client";

import type { ApiBody, ErrorCode } from "./errors";

export class ClientApiError extends Error {
  constructor(
    readonly code: ErrorCode | "NETWORK_ERROR" | "TIMEOUT",
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
  /** Network-level failure: the request may not have reached the server. Safe to queue. */
  get isNetwork() {
    return this.code === "NETWORK_ERROR" || this.code === "TIMEOUT";
  }
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  /** keepalive lets an SOS request finish even if the page is closed mid-flight. */
  keepalive?: boolean;
  signal?: AbortSignal;
}

/** Typed fetch for Raksha's JSON API. Throws ClientApiError with the server's error code. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  options.signal?.addEventListener("abort", () => controller.abort());
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
      keepalive: options.keepalive,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    throw new ClientApiError(aborted ? "TIMEOUT" : "NETWORK_ERROR", aborted ? "The request timed out." : "No internet connection.", 0);
  } finally {
    clearTimeout(timeout);
  }
  let body: ApiBody<T> | null = null;
  try {
    body = (await res.json()) as ApiBody<T>;
  } catch {
    // non-JSON (e.g. proxy error page)
  }
  if (!body) throw new ClientApiError(res.status >= 500 ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR", "Unexpected response from server.", res.status);
  if (!body.success) throw new ClientApiError(body.error.code, body.error.message, res.status, body.error.details);
  return body.data;
}
