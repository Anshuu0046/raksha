import { hmac } from "@/lib/security/tokens";

/** Best-effort client IP. On Vercel, x-forwarded-for is set by the edge and trustworthy. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "0.0.0.0";
}

/** Audit logs store a keyed hash of the IP, never the raw address. */
export function ipHash(req: Request): string {
  return hmac(clientIp(req), "ip").slice(0, 32);
}

export function userAgent(req: Request): string | null {
  return req.headers.get("user-agent")?.slice(0, 300) ?? null;
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
