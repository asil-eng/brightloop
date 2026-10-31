import "server-only";
import { Prisma, type PaymentMethod } from "@prisma/client";
import type { Db, Tx } from "./db";
import { addDays, addMonths, addPeriod, formatDate, startOfDay } from "./dates";
import { applyDiscounts, computeLine, sumLines, taxLabel, type DiscountRule } from "./pricing";
import { nextNumber } from "./sequence";
import { logActivity } from "./activity";
import { appUrl, sendMail } from "./mail";
import { formatMoney } from "./money";
import { invoicePdf } from "./pdf";

export class BillingError extends Error {}

// ───────────── Subscription totals ─────────────

/** Recalculate every line and the header totals of a subscription from its taxes. */
export async function recomputeSubscription(tx: Tx, subscriptionId: string) {
  const lines = await tx.subscriptionLine.findMany({ where: { subscriptionId }, include: { taxes: true } });
  const amounts = lines.map((l) => computeLine(l.unitPrice, l.quantity, l.taxes));
  await Promise.all(
    lines.map((l, i) => tx.subscriptionLine.update({ where: { id: l.id }, data: amounts[i] })),
  );
  const t = sumLines(amounts);
  await tx.subscription.update({
    where: { id: subscriptionId },
    data: { untaxed: t.subtotal, taxTotal: t.taxAmount, total: t.total },
  });
}

// ───────────── Discounts ─────────────

export async function loadDiscountRules(tx: Tx): Promise<DiscountRule[]> {
  const rows = await tx.discount.findMany({
    where: { active: true },
    include: { products: { select: { id: true } }, subscriptions: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((d) => ({
    ...d,
    productIds: d.products.map((p) => p.id),
    subscriptionIds: d.subscriptions.map((s) => s.id),
  }));
}

// ───────────── Invoice generation ─────────────

function billingKey(subscriptionId: string, periodStart: Date) {
  return `${subscriptionId}:${periodStart.toISOString().slice(0, 10)}`;
}

/**
 * Create the invoice for a subscription's next billing period and move the next
 * invoice date forward. The unique billing key makes double billing impossible:
 * if the period was already invoiced, this returns null and changes nothing.
 */
export async function invoiceNextPeriod(
  db: Db,
  subscriptionId: string,
  opts: { userId?: string | null; discounts?: DiscountRule[] } = {},
): Promise<string | null> {
  const discounts = opts.discounts ?? (await loadDiscountRules(db));

  try {
    return await db.$transaction(async (tx) => {
      const sub = await tx.subscription.findUniqueOrThrow({
        where: { id: subscriptionId },
        include: { lines: { include: { taxes: true } }, plan: true, paymentTerm: true },
      });
      if (!["CONFIRMED", "ACTIVE"].includes(sub.status)) {
        throw new BillingError("Only confirmed or active subscriptions can be invoiced.");
      }
      if (!sub.lines.length) throw new BillingError("The subscription has no lines to invoice.");
      const periodStart = startOfDay(sub.nextInvoiceDate ?? sub.startDate);
      if (sub.expiryDate && periodStart > sub.expiryDate) {
        throw new BillingError("The subscription has reached its expiry date. Renew it to keep billing.");
      }
      const nextStart = addPeriod(periodStart, sub.plan.period, sub.plan.interval);
      let periodEnd = addDays(nextStart, -1);
      if (sub.expiryDate && periodEnd > sub.expiryDate) periodEnd = startOfDay(sub.expiryDate);

      const invoiceDate = startOfDay(new Date() > periodStart ? new Date() : periodStart);
      const { perLine, lineDiscountId, used } = applyDiscounts(
        sub.lines.map((l) => ({ productId: l.productId, unitPrice: l.unitPrice, quantity: l.quantity })),
        discounts,
        sub.id,
        invoiceDate,
      );

      // Count each discount use; a discount that hit its usage limit meanwhile is dropped.
      const applied = new Set<string>();
      for (const u of used) {
        const d = discounts.find((x) => x.id === u.id)!;
        const res = await tx.discount.updateMany({
          where: { id: u.id, ...(d.usageLimit !== null ? { usedCount: { lt: d.usageLimit } } : {}) },
          data: { usedCount: { increment: 1 } },
        });
        if (res.count) applied.add(u.id);
      }

      const lineData = sub.lines.map((l, i) => {
        const discountId = lineDiscountId[i] && applied.has(lineDiscountId[i]!) ? lineDiscountId[i] : null;
        const discountAmount = discountId ? perLine[i] : 0;
        const a = computeLine(l.unitPrice, l.quantity, l.taxes, discountAmount);
        return {
          productId: l.productId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount,
          discountId,
          taxLabel: taxLabel(l.taxes),
          ...a,
        };
      });
      const totals = sumLines(lineData);

      const invoice = await tx.invoice.create({
        data: {
          billingKey: billingKey(sub.id, periodStart),
          subscriptionId: sub.id,
          customerId: sub.customerId,
          invoiceDate,
          dueDate: addDays(invoiceDate, sub.paymentTerm?.dueDays ?? 0),
          periodStart,
          periodEnd,
          untaxed: totals.subtotal,
          taxTotal: totals.taxAmount,
          total: totals.total,
          discountTotal: lineData.reduce((s, l) => s + l.discountAmount, 0),
          lines: { create: lineData },
        },
      });

      const stillBilling = !sub.expiryDate || nextStart <= sub.expiryDate;
      await tx.subscription.update({
        where: { id: sub.id },
        data: { nextInvoiceDate: stillBilling ? nextStart : null },
      });
      await logActivity(
        tx,
        "subscription",
        sub.id,
        `Invoice created for ${formatDate(periodStart)} – ${formatDate(periodEnd)}.`,
        opts.userId);
      await logActivity(tx, "invoice", invoice.id, `Invoice created from ${sub.number}.`, opts.userId);
      return invoice.id;
    });
  } catch (e) {
    // Unique billing key clash → this period is already invoiced.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

// ───────────── Invoice actions ─────────────

export async function confirmInvoice(db: Db, invoiceId: string, userId?: string | null) {
  await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (inv.status !== "DRAFT") throw new BillingError("Only draft invoices can be confirmed.");
    const number = await nextNumber(tx, "invoice");
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "CONFIRMED", number } });
    await logActivity(tx, "invoice", invoiceId, `Invoice confirmed as ${number}.`, userId);
  });
}

export async function cancelInvoice(db: Db, invoiceId: string, userId?: string | null) {
  await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true } });
    if (inv.status === "CANCELLED") return;
    if (inv.amountPaid > 0) throw new BillingError("An invoice with payments cannot be cancelled.");
    // Free the billing period so it can be invoiced again, and give back discount uses.
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED", billingKey: null } });
    const discountIds = [...new Set(inv.lines.map((l) => l.discountId).filter(Boolean))] as string[];
    for (const id of discountIds) {
      await tx.discount.updateMany({ where: { id, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    }
    await logActivity(tx, "invoice", invoiceId, "Invoice cancelled.", userId);
  });
}

export async function sendInvoice(db: Db, invoiceId: string, userId?: string | null) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { customer: true } });
  if (inv.status === "DRAFT") await confirmInvoice(db, invoiceId, userId);
  if (inv.status === "CANCELLED") throw new BillingError("Cancelled invoices cannot be sent.");
  const fresh = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const pdf = await invoicePdf(db, invoiceId);
  const ok = await sendMail(db, {
    to: inv.customer.email,
    subject: `Invoice ${fresh.number} — ${formatMoney(fresh.total)}`,
    heading: `Invoice ${fresh.number}`,
    paragraphs: [
      `Hello ${inv.customer.name},`,
      `Your invoice ${fresh.number} for ${formatMoney(fresh.total)} is ready. It is due on ${formatDate(fresh.dueDate)}.`,
      fresh.status === "PAID" ? "This invoice is already paid — thank you!" : "You can view and pay it online using the button below.",
    ],
    button: { label: fresh.status === "PAID" ? "View invoice" : "View & pay invoice", url: `${appUrl()}/portal/invoices/${invoiceId}` },
    attachments: [{ filename: `${fresh.number!.replace(/\//g, "-")}.pdf`, content: pdf, contentType: "application/pdf" }],
    entity: { type: "invoice", id: invoiceId },
  });
  if (ok) await db.invoice.update({ where: { id: invoiceId }, data: { sentAt: new Date() } });
  await logActivity(db, "invoice", invoiceId, ok ? `Invoice emailed to ${inv.customer.email}.` : `Invoice not emailed to ${inv.customer.email}: company email not connected or sending failed.`, userId);
  return ok;
}

// ───────────── Payments ─────────────

export async function registerPayment(db: Db, input: {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  date: Date;
  note?: string;
  reference?: string;
  userId?: string | null;
}) {
  const payment = await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
    if (inv.status !== "CONFIRMED") throw new BillingError("Payments can only be recorded on confirmed, unpaid invoices.");
    const due = inv.total - inv.amountPaid;
    if (!(input.amount > 0)) throw new BillingError("The amount must be greater than zero.");
    if (input.amount > due) throw new BillingError(`The amount is more than what is due (${formatMoney(due)}).`);

    const number = await nextNumber(tx, "payment");
    const p = await tx.payment.create({
      data: {
        number,
        invoiceId: inv.id,
        amount: input.amount,
        method: input.method,
        date: input.date,
        note: input.note ?? "",
        reference: input.reference ?? "",
        createdById: input.userId ?? null,
      },
    });
    const amountPaid = inv.amountPaid + input.amount;
    const paid = amountPaid >= inv.total;
    await tx.invoice.update({
      where: { id: inv.id },
      data: { amountPaid, status: paid ? "PAID" : "CONFIRMED" },
    });
    await logActivity(
      tx,
      "invoice",
      inv.id,
      `Payment ${number} of ${formatMoney(input.amount)} recorded (${input.method.replace("_", " ").toLowerCase()}).${paid ? " Invoice fully paid." : ""}`,
      input.userId);
    return p;
  });

  const full = await db.payment.findUniqueOrThrow({
    where: { id: payment.id },
    include: { invoice: { include: { customer: true } } },
  });
  await sendMail(db, {
    to: full.invoice.customer.email,
    subject: `Payment received — ${formatMoney(full.amount)}`,
    heading: "Thank you for your payment",
    paragraphs: [
      `Hello ${full.invoice.customer.name},`,
      `We received ${formatMoney(full.amount)} on ${formatDate(full.date)} for invoice ${full.invoice.number}.`,
      full.invoice.status === "PAID"
        ? "The invoice is now fully paid."
        : `Remaining balance: ${formatMoney(full.invoice.total - full.invoice.amountPaid)}.`,
    ],
    button: { label: "View invoice", url: `${appUrl()}/portal/invoices/${full.invoiceId}` },
    entity: { type: "invoice", id: full.invoiceId },
  });
  return payment;
}

// ───────────── Subscription lifecycle helpers ─────────────

/** Length of the original contract in whole months (used when renewing). */
function contractMonths(start: Date, expiry: Date) {
  const end = addDays(expiry, 1);
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

/** Extend a subscription by the length of its original term and resume billing. */
export async function renewSubscription(tx: Tx, subscriptionId: string, userId?: string | null) {
  const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: { plan: true } });
  if (!sub.plan.renewable) throw new BillingError("This plan does not allow renewal.");
  if (!sub.expiryDate) throw new BillingError("This subscription has no expiry date, so it renews automatically.");
  const months = contractMonths(sub.startDate, sub.expiryDate);
  const newExpiry =
    months > 0 ? addDays(addMonths(addDays(sub.expiryDate, 1), months), -1) : addPeriod(sub.expiryDate, sub.plan.period, sub.plan.interval);
  await tx.subscription.update({
    where: { id: sub.id },
    data: {
      expiryDate: newExpiry,
      nextInvoiceDate: sub.nextInvoiceDate ?? addDays(startOfDay(sub.expiryDate), 1),
      renewalReminderAt: null,
      status: sub.status === "CLOSED" ? "ACTIVE" : sub.status,
      closedAt: null,
      closeReasonId: null,
    },
  });
  await logActivity(tx, "subscription", sub.id, `Subscription renewed until ${formatDate(newExpiry)}.`, userId);
}
