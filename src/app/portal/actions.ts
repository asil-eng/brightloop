"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, passwordError, requireCustomer, verifyPassword } from "@/lib/auth";
import { UserError, int, required, safeAction, str } from "@/lib/action";
import { registerPayment, recomputeSubscription } from "@/lib/billing";
import { logActivity } from "@/lib/activity";
import { closeSubscription, confirmSubscription, pauseSubscription, renew, resumeSubscription } from "@/lib/subscriptions";
import { formatMoney } from "@/lib/money";

/** Load a subscription only if it belongs to the logged-in customer. */
async function ownSubscription(id: string) {
  const user = await requireCustomer();
  const sub = await db.subscription.findFirst({ where: { id, customerId: user.customer.id }, include: { plan: true } });
  if (!sub) throw new UserError("Subscription not found.");
  return { user, sub };
}

export const portalSubscriptionAction = safeAction(async (data) => {
  const id = required(data, "id", "Subscription");
  const op = required(data, "op", "Action");
  const { user, sub } = await ownSubscription(id);
  const actor = { id: user.id, role: user.role };
  let ok = "";
  switch (op) {
    case "accept":
      if (sub.status !== "QUOTATION") throw new UserError("This quotation can no longer be accepted.");
      await confirmSubscription(id, actor);
      ok = "Thank you! Your subscription is confirmed.";
      break;
    case "pause":
      await pauseSubscription(id, actor);
      ok = "Your subscription is paused.";
      break;
    case "resume":
      await resumeSubscription(id, actor);
      ok = "Your subscription is active again.";
      break;
    case "renew":
      await renew(id, actor);
      ok = "Your subscription is renewed.";
      break;
    case "close":
      await closeSubscription(id, actor, str(data, "reasonId"));
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
  const { user, sub } = await ownSubscription(id);
  if (!["CONFIRMED", "ACTIVE", "PAUSED"].includes(sub.status)) throw new UserError("Add-ons can only be changed on a running subscription.");
  const product = await db.product.findFirst({ where: { id: productId, type: "ADDON", active: true }, include: { taxes: true } });
  if (!product) throw new UserError("This add-on isn't available.");

  const existing = await db.subscriptionLine.findFirst({ where: { subscriptionId: id, productId } });
  if (existing) {
    await db.subscriptionLine.delete({ where: { id: existing.id } });
    await logActivity("subscription", id, `Add-on "${product.name}" switched off by the customer.`, user.id);
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
    await logActivity("subscription", id, `Add-on "${product.name}" (×${quantity}) switched on by the customer.`, user.id);
  }
  await recomputeSubscription(id);
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

  await registerPayment({
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
  const current = required(data, "current", "Current password");
  const password = required(data, "password", "New password");
  if (!user.passwordHash || !(await verifyPassword(current, user.passwordHash))) throw new UserError("Your current password is incorrect.");
  const err = passwordError(password);
  if (err) throw new UserError(err);
  if (password !== str(data, "confirm")) throw new UserError("The passwords do not match.");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  return { ok: "Password changed." };
});
