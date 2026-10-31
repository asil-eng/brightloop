"use server";

import { revalidatePath } from "next/cache";
import type { Db } from "@/lib/db";
import { redirect } from "next/navigation";
import { requireBackoffice } from "@/lib/auth";
import { ownedOne, required, safeAction, str, UserError } from "@/lib/action";
import { parseLines } from "@/lib/catalog";
import { addDays, parseInputDate, startOfDay } from "@/lib/dates";
import { nextNumber } from "@/lib/sequence";
import { logActivity } from "@/lib/activity";
import { recomputeSubscription, invoiceNextPeriod } from "@/lib/billing";
import {
  activateSubscription,
  closeSubscription,
  confirmSubscription,
  pauseSubscription,
  renew,
  resumeSubscription,
  sendQuotation,
} from "@/lib/subscriptions";

async function readHeader(db: Db, data: FormData) {
  const customerId = required(data, "customerId", "Customer");
  const planId = required(data, "planId", "Plan");
  const plan = await db.recurringPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.active) throw new UserError("Choose an active plan.");
  if (!(await db.customer.findUnique({ where: { id: customerId } }))) throw new UserError("Choose a customer.");
  const startDate = parseInputDate(data.get("startDate"));
  if (!startDate) throw new UserError("Start date is required.");
  // The plan must be available on the start date.
  if (plan.startDate && startDate < startOfDay(plan.startDate)) throw new UserError(`The ${plan.name} plan is only available from ${plan.startDate.toLocaleDateString("en-GB")}.`);
  if (plan.endDate && startDate > plan.endDate) throw new UserError(`The ${plan.name} plan is no longer available after ${plan.endDate.toLocaleDateString("en-GB")}.`);
  const expiryDate = parseInputDate(data.get("expiryDate"));
  if (expiryDate && expiryDate <= startDate) throw new UserError("The expiry date must be after the start date.");
  const quoteValidUntil = parseInputDate(data.get("quoteValidUntil"));
  return {
    plan,
    header: {
      customerId,
      planId,
      startDate,
      expiryDate,
      quoteValidUntil,
      paymentTermId: await ownedOne(db.paymentTerm, str(data, "paymentTermId")),
      templateId: await ownedOne(db.quotationTemplate, str(data, "templateId")),
      note: str(data, "note"),
    },
  };
}

function lineCreates(lines: Awaited<ReturnType<typeof parseLines>>) {
  return lines.map((l) => ({
    productId: l.productId,
    variantId: l.variantId,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    taxes: { connect: l.taxIds.map((id) => ({ id })) },
  }));
}

export const createSubscription = safeAction(async (data) => {
  const user = await requireBackoffice();
  const { db } = user;
  const { plan, header } = await readHeader(db, data);
  const lines = await parseLines(db, str(data, "lines"), { minQuantity: plan.minQuantity });
  // Add the plan's own price as a line, taxed like the first product.
  if (plan.price > 0 && !lines.some((l) => l.productId === null)) {
    lines.unshift({ productId: null, variantId: null, description: `${plan.name} plan`, quantity: 1, unitPrice: plan.price, taxIds: lines.find((l) => l.productId)?.taxIds ?? [] });
  }
  const sub = await db.$transaction(async (tx) => {
    const number = await nextNumber(tx, "subscription");
    const s = await tx.subscription.create({
      data: { ...header, number, salespersonId: user.id, quoteValidUntil: header.quoteValidUntil ?? addDays(startOfDay(), 30), lines: { create: lineCreates(lines) } },
    });
    await logActivity(tx, "subscription", s.id, header.templateId ? "Quotation created from a template." : "Subscription created.", user.id);
    return s;
  });
  await recomputeSubscription(db, sub.id);
  redirect(`/app/subscriptions/${sub.id}`);
});

export const updateSubscription = safeAction(async (data) => {
  const user = await requireBackoffice();
  const { db } = user;
  const id = required(data, "id", "Subscription");
  const current = await db.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true } });
  if (current.status === "CLOSED") throw new UserError("Closed subscriptions can't be changed.");
  const editableHeader = current.status === "DRAFT" || current.status === "QUOTATION";

  let minQuantity = current.plan.minQuantity;
  let headerData = {};
  if (editableHeader) {
    const { plan, header } = await readHeader(db, data);
    minQuantity = plan.minQuantity;
    headerData = header;
  } else {
    // After confirmation only the expiry date, payment terms and note can change.
    const expiryDate = parseInputDate(data.get("expiryDate"));
    if (expiryDate && expiryDate <= current.startDate) throw new UserError("The expiry date must be after the start date.");
    headerData = { expiryDate, paymentTermId: await ownedOne(db.paymentTerm, str(data, "paymentTermId")), note: str(data, "note") };
  }
  const lines = await parseLines(db, str(data, "lines"), { minQuantity });

  await db.$transaction(async (tx) => {
    await tx.subscriptionLine.deleteMany({ where: { subscriptionId: id } });
    await tx.subscription.update({ where: { id }, data: { ...headerData, lines: { create: lineCreates(lines) } } });
    await logActivity(tx, "subscription", id, editableHeader ? "Quotation updated." : "Subscription lines updated (applies from the next invoice).", user.id);
  });
  await recomputeSubscription(db, id);
  revalidatePath(`/app/subscriptions/${id}`);
  return { ok: "Saved." };
});

/** One endpoint for every status button on the subscription form. */
export const subscriptionAction = safeAction(async (data) => {
  const user = await requireBackoffice();
  const { db } = user;
  const id = required(data, "id", "Subscription");
  const op = required(data, "op", "Action");
  const actor = { id: user.id, role: user.role };
  let ok = "";
  switch (op) {
    case "send":
      await sendQuotation(db, id, actor);
      ok = "Quotation sent to the customer.";
      break;
    case "confirm":
      await confirmSubscription(db, id, actor);
      ok = "Subscription confirmed.";
      break;
    case "activate":
      await activateSubscription(db, id, actor);
      ok = "Subscription started.";
      break;
    case "pause":
      await pauseSubscription(db, id, actor);
      ok = "Subscription paused.";
      break;
    case "resume":
      await resumeSubscription(db, id, actor);
      ok = "Subscription resumed.";
      break;
    case "renew":
      await renew(db, id, actor);
      ok = "Subscription renewed.";
      break;
    case "close":
      await closeSubscription(db, id, actor, str(data, "reasonId"));
      ok = "Subscription closed.";
      break;
    case "invoice": {
      const invoiceId = await invoiceNextPeriod(db, id, { userId: user.id });
      if (!invoiceId) throw new UserError("The next period has already been invoiced.");
      redirect(`/app/invoices/${invoiceId}`);
    }
    default:
      throw new UserError("Unknown action.");
  }
  revalidatePath(`/app/subscriptions/${id}`);
  return { ok };
});
