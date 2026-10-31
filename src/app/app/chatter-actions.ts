"use server";

import { revalidatePath } from "next/cache";
import { requireBackoffice } from "@/lib/auth";
import { logActivity, type EntityType } from "@/lib/activity";
import { required, safeAction } from "@/lib/action";

export const addNote = safeAction(async (data) => {
  const user = await requireBackoffice();
  const { db } = user;
  const entityType = required(data, "entityType", "Record") as EntityType;
  const entityId = required(data, "entityId", "Record");
  const message = required(data, "message", "Note");
  await logActivity(db, entityType, entityId, message, user.id, true);
  revalidatePath(required(data, "path", "Path"));
  return { ok: "Note added." };
});
