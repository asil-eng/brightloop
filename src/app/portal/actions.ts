"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { hashPassword, passwordError, requireCustomer, verifyPassword } from "@/lib/auth";
import { UserError, int, required, safeAction, str } from "@/lib/action";
import { BillingError, registerPayment, recomputeSubscription } from "@/lib/billing";
import { rootDb } from "@/lib/db";
import { unseal } from "@/lib/secret-box";
import { RazorpayError, capturePayment, createOrder, fetchOrder, fetchPayment, verifySignature } from "@/lib/razorpay";
import { logActivity } from "@/lib/activity";
import { closeSubscription, confirmSubscription, pauseSubscription, renew, resumeSubscription } from "@/lib/subscriptions";
import { formatMoney } from "@/lib/money";

/** Load a subscription only if it belongs to the logged-in customer. */
async function ownSubscription(id: string) {
  const user = await requireCustomer();
  const { db } = user;
  const sub = await db.subscription.findFirst({ where: { id, customerId: user.customer.id }, include: { plan: true } });
  if (!sub) throw new UserError("Subscription not found.");
  return { user, sub, db };
}

export const portalSubscriptionAction = safeAction(async (data) => {
  const id = required(data, "id", "Subscription");
  const op = required(data, "op", "Action");
  const { user, sub, db } = await ownSubscription(id);
  const actor = { id: user.id, role: user.role };
  let ok = "";
  switch (op) {
    case "accept":
      if (sub.status !== "QUOTATION") throw new UserError("This quotation can no longer be accepted.");
      await confirmSubscription(db, id, actor);
      ok = "Thank you! Your subscription is confirmed.";
      break;
    case "pause":
      await pauseSubscription(db, id, actor);
      ok = "Your subscription is paused.";
      break;
    case "resume":
      await resumeSubscription(db, id, actor);
      ok = "Your subscription is active again.";
      break;
    case "renew":
      await renew(db, id, actor);
      ok = "Your subscription is renewed.";
      break;
    case "close":
      await closeSubscription(db, id, actor, str(data, "reasonId"));
      ok = sub.status === "QUOTATION" ? "Quotation declined." : "Your subscription is closed.";
      break;
    default:
      throw new UserError("Unknown action.");
  }
  revalidatePath(`/portal/subscriptions/${id}`);
  return { ok };
});

/** Customers switch add-ons on and off. The change shows on the next invoice. */
export const toggleAddon = safeAction(async (data) => {
  const id = required(data, "id", "Subscription");
  const productId = required(data, "productId", "Add-on");
  const { user, sub, db } = await ownSubscription(id);
  if (!["CONFIRMED", "ACTIVE", "PAUSED"].includes(sub.status)) throw new UserError("Add-ons can only be changed on a running subscription.");
  const product = await db.product.findFirst({ where: { id: productId, type: "ADDON", active: true }, include: { taxes: true } });
  if (!product) throw new UserError("This add-on isn't available.");

  const existing = await db.subscriptionLine.findFirst({ where: { subscriptionId: id, productId } });
  if (existing) {
    await db.subscriptionLine.delete({ where: { id: existing.id } });
    await logActivity(db, "subscription", id, `Add-on "${product.name}" switched off by the customer.`, user.id);
  } else {
    const quantity = Math.max(1, int(data, "quantity", 1), sub.plan.minQuantity);
    await db.subscriptionLine.create({
      data: {
        subscriptionId: id,
        productId,
        description: product.name,
        quantity,
        unitPrice: product.salesPrice,
        taxes: { connect: product.taxes.map((t) => ({ id: t.id })) },
      },
    });
    await logActivity(db, "subscription", id, `Add-on "${product.name}" (×${quantity}) switched on by the customer.`, user.id);
  }
  await recomputeSubscription(db, id);
  revalidatePath(`/portal/subscriptions/${id}`);
  return { ok: existing ? `${product.name} switched off. It won't be billed from your next invoice.` : `${product.name} switched on. It will appear on your next invoice.` };
});

/**
 * Demo payment provider (like Odoo's "Demo" provider): simulates a card or UPI
 * checkout so the full pay-online flow works without real payment keys.
 * Card 4000 0000 0000 0002 is declined, to show the failure path.
 */
export const payOnline = safeAction(async (data) => {
  const user = await requireCustomer();
  const { db } = user;
  const invoiceId = required(data, "invoiceId", "Invoice");
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, customerId: user.customer.id } });
  if (!invoice) throw new UserError("Invoice not found.");
  if (invoice.status !== "CONFIRMED") throw new UserError("This invoice doesn't need paying.");
  const due = invoice.total - invoice.amountPaid;

  const method = str(data, "method") === "UPI" ? "UPI" : "CARD";
  let reference: string;
  if (method === "CARD") {
    const card = str(data, "card").replace(/\s+/g, "");
    if (!/^\d{16}$/.test(card)) throw new UserError("Enter a 16-digit card number.");
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(str(data, "expiry"))) throw new UserError("Enter the expiry as MM/YY.");
    if (!/^\d{3,4}$/.test(str(data, "cvc"))) throw new UserError("Enter the 3-digit security code.");
    if (card === "4000000000000002") throw new UserError("Your card was declined. Please try another card.");
    reference = `DEMO-CARD-${card.slice(-4)}-${Date.now().toString(36).toUpperCase()}`;
  } else {
    const vpa = str(data, "vpa");
    if (!/^[\w.-]+@[\w]+$/.test(vpa)) throw new UserError("Enter a valid UPI ID, e.g. name@bank.");
    reference = `DEMO-UPI-${Date.now().toString(36).toUpperCase()}`;
  }

  await registerPayment(db, {
    invoiceId,
    amount: due,
    method,
    date: new Date(),
    note: "Paid online through the customer portal",
    reference,
    userId: user.id,
  });
  redirect(`/portal/invoices/${invoiceId}?paid=${encodeURIComponent(formatMoney(due))}`);
});

export const updateProfile = safeAction(async (data) => {
  const user = await requireCustomer();
  const { db } = user;
  const name = required(data, "name", "Name");
  await db.$transaction([
    db.customer.update({
      where: { id: user.customer.id },
      data: { name, phone: str(data, "phone"), company: str(data, "company"), address: str(data, "address"), taxId: str(data, "taxId") },
    }),
    db.user.update({ where: { id: user.id }, data: { name } }),
  ]);
  revalidatePath("/portal/profile");
  return { ok: "Profile saved." };
});

export const changePassword = safeAction(async (data) => {
  const user = await requireCustomer();
  const { db } = user;
  const current = required(data, "current", "Current password");
  const password = required(data, "password", "New password");
  if (!user.passwordHash || !(await verifyPassword(current, user.passwordHash))) throw new UserError("Your current password is incorrect.");
  const err = passwordError(password);
  if (err) throw new UserError(err);
  if (password !== str(data, "confirm")) throw new UserError("The passwords do not match.");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  return { ok: "Password changed." };
});

// ───────────── Razorpay (test mode) ─────────────

async function razorpayFor(invoiceId: string) {
  const user = await requireCustomer();
  const { db } = user;
  const org = await db.organization.findFirstOrThrow();
  if (!org.razorpayKeyId || !org.razorpayKeySecret) throw new UserError("Online card payments aren't set up for this company.");
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, customerId: user.customer.id } });
  if (!invoice) throw new UserError("Invoice not found.");
  return { user, db, org, invoice, keys: { keyId: org.razorpayKeyId, keySecret: unseal(org.razorpayKeySecret) } };
}

/** Create a Razorpay order for exactly what is due on this invoice. */
export async function startRazorpayPayment(invoiceId: string) {
  try {
    const { user, org, invoice, keys } = await razorpayFor(invoiceId);
    if (invoice.status !== "CONFIRMED") return { error: "This invoice doesn't need paying." };
    const due = invoice.total - invoice.amountPaid;
    const order = await createOrder(keys, { amount: due, receipt: invoice.number ?? invoice.id, notes: { invoiceId: invoice.id, orgId: org.id } });
    return {
      ok: true as const,
      keyId: keys.keyId,
      orderId: order.id,
      amount: order.amount,
      company: org.name,
      description: `Invoice ${invoice.number}`,
      prefill: { name: user.customer.name, email: user.customer.email, contact: user.customer.phone },
    };
  } catch (e) {
    return { error: e instanceof UserError || e instanceof RazorpayError ? e.message : "Couldn't start the payment. Please try again." };
  }
}

/**
 * Called by Checkout's success handler. Nothing from the browser is trusted on its own: the signature is
 * checked with the company's secret, and the order and payment are fetched from Razorpay to confirm they
 * belong to this invoice and amount before the payment is recorded.
 */
export async function confirmRazorpayPayment(input: { invoiceId: string; orderId: string; paymentId: string; signature: string }) {
  let paid = 0;
  try {
    const { user, db, invoice, keys } = await razorpayFor(input.invoiceId);
    if (!verifySignature(input.orderId, input.paymentId, input.signature, keys.keySecret)) throw new UserError("The payment couldn't be verified.");
    if (await rootDb.payment.findUnique({ where: { gatewayPaymentId: input.paymentId } })) {
      redirect(`/portal/invoices/${invoice.id}`); // already recorded (e.g. a double callback)
    }
    const [order, payment0] = await Promise.all([fetchOrder(keys, input.orderId), fetchPayment(keys, input.paymentId)]);
    if (order.notes?.invoiceId !== invoice.id || payment0.order_id !== order.id || payment0.amount !== order.amount) {
      throw new UserError("The payment doesn't match this invoice.");
    }
    const payment = payment0.status === "authorized" ? await capturePayment(keys, payment0.id, payment0.amount) : payment0;
    if (payment.status !== "captured") throw new UserError(`The payment is ${payment.status}, not captured.`);
    const method = payment.method === "upi" ? "UPI" : payment.method === "card" ? "CARD" : payment.method === "netbanking" ? "BANK_TRANSFER" : "ONLINE";
    await registerPayment(db, {
      invoiceId: invoice.id,
      amount: Math.min(payment.amount, invoice.total - invoice.amountPaid),
      method,
      date: new Date(),
      note: `Paid online with Razorpay (${payment.method}, test mode)`,
      reference: payment.id,
      gatewayPaymentId: payment.id,
      userId: user.id,
    });
    paid = payment.amount;
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof UserError || e instanceof RazorpayError || e instanceof BillingError ? e.message : "Couldn't record the payment. Contact the company if money was taken." };
  }
  redirect(`/portal/invoices/${input.invoiceId}?paid=${encodeURIComponent(formatMoney(paid))}`);
}
