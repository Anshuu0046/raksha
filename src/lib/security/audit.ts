import { getRepository } from "@/lib/db";
import type { AuditActor } from "@/types";

export interface AuditInput {
  userId: string | null;
  actor: AuditActor;
  action: string;
  targetType?: string;
  targetId?: string;
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
}

/** Audit writes never break the request that triggered them. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await getRepository().addAudit({
      userId: input.userId,
      actor: input.actor,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ipHash: input.ipHash ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    console.error("[raksha] audit write failed:", err instanceof Error ? err.message : err);
  }
}
