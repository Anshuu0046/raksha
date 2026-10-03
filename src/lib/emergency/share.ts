import { getRepository } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { generateToken, hashToken } from "@/lib/security/tokens";
import type { ShareLink } from "@/types";

/** Live-location links live 24 h, are extended while the emergency is active, and die when it ends. */
export const SHARE_TTL_MS = 24 * 60 * 60 * 1000;
/** After an emergency ends, the link still shows "resolved" (no location) for this long. */
export const SHARE_STATUS_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function shareUrl(token: string): string {
  return `${appUrl()}/emergency/${token}`;
}

/**
 * Creates a new random share token. Only its SHA-256 hash is stored; the raw token exists
 * only in the outgoing message / the response to the owner.
 */
export async function mintShareLink(eventId: string, contactId: string | null): Promise<{ url: string; share: ShareLink }> {
  const token = generateToken();
  const share = await getRepository().createShare({
    eventId,
    contactId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SHARE_TTL_MS).toISOString(),
  });
  return { url: shareUrl(token), share };
}

export function alertInviteUrl(token: string): string {
  return `${appUrl()}/alerts/${token}`;
}
