import type { Prisma } from "@prisma/client";
import { db } from "./db";

export type EntityType = "subscription" | "invoice" | "customer";

export async function logActivity(
  entityType: EntityType,
  entityId: string,
  message: string,
  userId?: string | null,
  tx: Prisma.TransactionClient = db,
  isNote = false,
) {
  await tx.activity.create({
    data: { entityType, entityId, message, userId: userId ?? null, isNote },
  });
}
