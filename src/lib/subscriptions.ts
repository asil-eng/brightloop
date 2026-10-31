import "server-only";
import type { SubscriptionStatus } from "@prisma/client";
import type { Db } from "./db";
import { BillingError, confirmInvoice, invoiceNextPeriod, recomputeSubscription, renewSubscription, sendInvoice } from "./billing";
import { logActivity } from "./activity";
import { formatDate, startOfDay } from "./dates";
import { appUrl, sendMail } from "./mail";
import { formatMoney } from "./money";
import { ownedOne } from "./owned";

type Actor = { id: string; role: string } | null;

async function load(db: Db, id: string) {
  return db.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true, customer: true } });
}

function assertStatus(current: SubscriptionStatus, allowed: SubscriptionStatus[], action: string) {
  if (!allowed.includes(current)) {
    throw new BillingError(`Can't ${action} a subscription that is ${current.toLowerCase()}.`);
  }
}

async function notify(db: Db, subId: string, subject: string, heading: string, paragraphs: string[]) {
  const s = await load(db, subId);
  await sendMail(db, {
    to: s.customer.email,
    subject,
    heading,
    paragraphs: [`Hello ${s.customer.name},`, ...paragraphs],
    button: { label: "View subscription", url: `${appUrl()}/portal/subscriptions/${s.id}` },
    entity: { type: "subscription", id: s.id },
  });
}

/** Invoice the first period now and confirm/send it according to company settings. */
async function billNow(db: Db, subId: string, actor: Actor) {
  const company = await db.organization.findFirst();
  const invoiceId = await invoiceNextPeriod(db, subId, { userId: actor?.id });
  if (invoiceId && company?.autoConfirmInvoices) {
    await confirmInvoice(db, invoiceId, actor?.id);
    if (company.autoSendInvoices) await sendInvoice(db, invoiceId, actor?.id);
  }
  return invoiceId;
}

export async function sendQuotation(db: Db, subId: string, actor: Actor) {
  const s = await load(db, subId);
  assertStatus(s.status, ["DRAFT", "QUOTATION"], "send");
  await db.subscription.update({ where: { id: subId }, data: { status: "QUOTATION" } });
  await sendMail(db, {
    to: s.customer.email,
    subject: `Your quotation ${s.number} from ${(await db.organization.findFirstOrThrow()).name}`,
    heading: `Quotation ${s.number}`,
    paragraphs: [
      `Hello ${s.customer.name},`,
      `Here is your quotation for the ${s.plan.name} plan: ${formatMoney(s.total)} per billing period, starting ${formatDate(s.startDate)}.`,
      s.quoteValidUntil ? `This offer is valid until ${formatDate(s.quoteValidUntil)}.` : "",
      "You can review and accept it online.",
    ].filter(Boolean),
    button: { label: "Review & accept", url: `${appUrl()}/portal/subscriptions/${s.id}` },
    entity: { type: "subscription", id: s.id },
  });
  await logActivity(db, "subscription", subId, `Quotation sent to ${s.customer.email}.`, actor?.id);
}

/** Confirm a quotation. If the start date has arrived it becomes active and the first invoice is created. */
export async function confirmSubscription(db: Db, subId: string, actor: Actor) {
  const s = await load(db, subId);
  assertStatus(s.status, ["DRAFT", "QUOTATION"], "confirm");
  if (s.quoteValidUntil && s.status === "QUOTATION" && s.quoteValidUntil < startOfDay()) {
    throw new BillingError("This quotation has expired. Update its validity date first.");
  }
  const lineCount = await db.subscriptionLine.count({ where: { subscriptionId: subId } });
  if (!lineCount) throw new BillingError("Add at least one line before confirming.");
  await recomputeSubscription(db, subId);
  await db.subscription.update({ where: { id: subId }, data: { status: "CONFIRMED", nextInvoiceDate: s.startDate } });
  await logActivity(db, "subscription", subId, actor?.role === "CUSTOMER" ? "Quotation accepted by the customer." : "Subscription confirmed.", actor?.id);

  if (s.startDate <= new Date()) await activateSubscription(db, subId, actor, true);
  else {
    await notify(db, subId, `Subscription ${s.number} confirmed`, "Your subscription is confirmed", [
      `Your ${s.plan.name} subscription starts on ${formatDate(s.startDate)}. Your first invoice will be sent then.`,
    ]);
  }
}

export async function activateSubscription(db: Db, subId: string, actor: Actor, fromConfirm = false) {
  const s = await load(db, subId);
  assertStatus(s.status, ["CONFIRMED"], "start");
  await db.subscription.update({ where: { id: subId }, data: { status: "ACTIVE", nextInvoiceDate: s.nextInvoiceDate ?? s.startDate } });
  await logActivity(db, "subscription", subId, "Subscription is now active.", actor?.id);
  if (s.startDate <= new Date()) await billNow(db, subId, actor);
  await notify(db, subId, `Subscription ${s.number} is active`, "Your subscription is active", [
    `Your ${s.plan.name} subscription is now active${fromConfirm ? "" : ` from ${formatDate(s.startDate)}`}.`,
  ]);
}

export async function pauseSubscription(db: Db, subId: string, actor: Actor) {
  const s = await load(db, subId);
  assertStatus(s.status, ["ACTIVE"], "pause");
  if (!s.plan.pausable) throw new BillingError("This plan doesn't allow pausing.");
  await db.subscription.update({ where: { id: subId }, data: { status: "PAUSED" } });
  await logActivity(db, "subscription", subId, "Subscription paused. Billing is on hold.", actor?.id);
  await notify(db, subId, `Subscription ${s.number} paused`, "Your subscription is paused", ["You won't be billed while it's paused. You can resume it any time."]);
}

export async function resumeSubscription(db: Db, subId: string, actor: Actor) {
  const s = await load(db, subId);
  assertStatus(s.status, ["PAUSED"], "resume");
  const today = startOfDay();
  // Periods while paused are not billed: billing restarts from today.
  const next = s.nextInvoiceDate && s.nextInvoiceDate > today ? s.nextInvoiceDate : today;
  await db.subscription.update({ where: { id: subId }, data: { status: "ACTIVE", nextInvoiceDate: s.expiryDate && next > s.expiryDate ? null : next } });
  await logActivity(db, "subscription", subId, "Subscription resumed.", actor?.id);
  await notify(db, subId, `Subscription ${s.number} resumed`, "Welcome back", [`Your subscription is active again. Next invoice: ${formatDate(next)}.`]);
}

export async function closeSubscription(db: Db, subId: string, actor: Actor, reasonIdInput?: string | null) {
  const reasonId = await ownedOne(db.closeReason, reasonIdInput);
  const s = await load(db, subId);
  assertStatus(s.status, ["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "PAUSED"], "close");
  const isQuote = s.status === "DRAFT" || s.status === "QUOTATION";
  const ended = s.expiryDate && s.expiryDate < startOfDay();
  if (!isQuote && !ended && !s.plan.closable) {
    throw new BillingError("This plan can't be closed before the end of its term.");
  }
  await db.subscription.update({
    where: { id: subId },
    data: { status: "CLOSED", closedAt: new Date(), closeReasonId: reasonId || null, nextInvoiceDate: null },
  });
  const reason = reasonId ? await db.closeReason.findUnique({ where: { id: reasonId } }) : null;
  await logActivity(db, "subscription", subId, `Subscription closed${reason ? ` — ${reason.name}` : ""}${actor?.role === "CUSTOMER" ? " by the customer" : ""}.`, actor?.id);
  if (!isQuote) await notify(db, subId, `Subscription ${s.number} closed`, "Your subscription has been closed", ["No further invoices will be created. Thank you for being with us."]);
}

export async function renew(db: Db, subId: string, actor: Actor) {
  await renewSubscription(db, subId, actor?.id);
  const s = await load(db, subId);
  await notify(db, subId, `Subscription ${s.number} renewed`, "Your subscription is renewed", [`It now runs until ${formatDate(s.expiryDate)}.`]);
}

export { billNow };
