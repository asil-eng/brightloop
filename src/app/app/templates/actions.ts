"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireBackoffice } from "@/lib/auth";
import { UserError, int, required, safeAction, str } from "@/lib/action";
import { parseLines } from "@/lib/catalog";

async function readTemplate(data: FormData) {
  const planId = required(data, "planId", "Plan");
  const plan = await db.recurringPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new UserError("Choose a plan.");
  const validityDays = int(data, "validityDays", 30);
  if (validityDays < 1) throw new UserError("Validity must be at least 1 day.");
  const lines = (await parseLines(str(data, "lines"), { minQuantity: plan.minQuantity })).filter((l) => l.productId);
  if (!lines.length) throw new UserError("Add at least one product line.");
  return {
    template: {
      name: required(data, "name", "Template name"),
      planId,
      validityDays,
      paymentTermId: str(data, "paymentTermId") || null,
      note: str(data, "note"),
    },
    lines: lines.map((l) => ({ productId: l.productId!, variantId: l.variantId, quantity: l.quantity })),
  };
}

export const createTemplate = safeAction(async (data) => {
  await requireBackoffice();
  const { template, lines } = await readTemplate(data);
  const t = await db.quotationTemplate.create({ data: { ...template, lines: { create: lines } } });
  redirect(`/app/templates/${t.id}`);
});

export const updateTemplate = safeAction(async (data) => {
  await requireBackoffice();
  const id = required(data, "id", "Template");
  const { template, lines } = await readTemplate(data);
  await db.$transaction([
    db.templateLine.deleteMany({ where: { templateId: id } }),
    db.quotationTemplate.update({ where: { id }, data: { ...template, lines: { create: lines } } }),
  ]);
  revalidatePath(`/app/templates/${id}`);
  return { ok: "Template saved." };
});
