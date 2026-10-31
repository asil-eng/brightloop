import type { Tx } from "./db";

export type EntityType = "subscription" | "invoice" | "customer";

/** Add an entry to a record's chatter. `tx` must be a company-scoped client. */
export async function logActivity(
  tx: Tx,
  entityType: EntityType,
  entityId: string,
  message: string,
  userId?: string | null,
  isNote = false,
) {
  await tx.activity.create({
    data: { entityType, entityId, message, userId: userId ?? null, isNote },
  });
}
