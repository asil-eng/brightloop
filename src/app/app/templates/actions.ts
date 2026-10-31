"use server";

import { revalidatePath } from "next/cache";
import type { Db } from "@/lib/db";
import { redirect } from "next/navigation";
import { requireBackoffice } from "@/lib/auth";
import { int, ownedOne, required, safeAction, str, UserError } from "@/lib/action";
import { parseLines } from "@/lib/catalog";

async function readTemplate(db: Db, data: FormData) {
  const planId = required(data, "planId", "Plan");
  const plan = await db.recurringPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new UserError("Choose a plan.");
  const validityDays = int(data, "validityDays", 30);
  if (validityDays < 1) throw new UserError("Validity must be at least 1 day.");
  const lines = (await parseLines(db, str(data, "lines"), { minQuantity: plan.minQuantity })).filter((l) => l.productId);
  if (!lines.length) throw new UserError("Add at least one product line.");
  return {
    template: {
      name: required(data, "name", "Template name"),
      planId,
      validityDays,
      paymentTermId: await ownedOne(db.paymentTerm, str(data, "paymentTermId")),
      note: str(data, "note"),
    },
    lines: lines.map((l) => ({ productId: l.productId!, variantId: l.variantId, quantity: l.quantity })),
  };
}

export const createTemplate = safeAction(async (data) => {
  const { db } = await requireBackoffice();
  const { template, lines } = await readTemplate(db, data);
  const t = await db.quotationTemplate.create({ data: { ...template, lines: { create: lines } } });
  redirect(`/app/templates/${t.id}`);
});

export const updateTemplate = safeAction(async (data) => {
  const { db } = await requireBackoffice();
  const id = required(data, "id", "Template");
  const { template, lines } = await readTemplate(db, data);
  await db.$transaction([
    db.templateLine.deleteMany({ where: { templateId: id } }),
    db.quotationTemplate.update({ where: { id }, data: { ...template, lines: { create: lines } } }),
  ]);
  revalidatePath(`/app/templates/${id}`);
  return { ok: "Template saved." };
});
