import "server-only";
import { rootDb, scopedDb, type Db } from "./db";
import { addDays, formatDate, startOfDay } from "./dates";
import { BillingError, confirmInvoice, invoiceNextPeriod, loadDiscountRules, renewSubscription, sendInvoice } from "./billing";
import { logActivity } from "./activity";
import { appUrl, sendMail } from "./mail";
import { formatMoney } from "./money";

const MAX_CATCH_UP = 36; // periods per subscription per run, guards against runaway loops

export type JobResult = { name: string; count: number; errors: string[] };

/** Activate confirmed subscriptions whose start date has arrived. */
export async function activateStarted(db: Db): Promise<JobResult> {
  const today = startOfDay();
  const subs = await db.subscription.findMany({
    where: { status: "CONFIRMED", startDate: { lt: addDays(today, 1) } },
    select: { id: true, startDate: true },
  });
  for (const s of subs) {
    await db.subscription.update({ where: { id: s.id }, data: { status: "ACTIVE" } });
    await logActivity(db, "subscription", s.id, "Subscription started (start date reached).");
  }
  return { name: "Activate started subscriptions", count: subs.length, errors: [] };
}

/**
 * Billing day: invoice every active subscription that is due, catching up on any
 * missed periods. Invoices are confirmed and emailed according to company settings.
 */
export async function runBilling(db: Db): Promise<JobResult> {
  const today = startOfDay();
  const company = await db.organization.findFirst();
  const discounts = await loadDiscountRules(db);
  const errors: string[] = [];
  let count = 0;

  const due = await db.subscription.findMany({
    where: { status: "ACTIVE", nextInvoiceDate: { lte: today } },
    select: { id: true, number: true },
  });

  for (const s of due) {
    for (let i = 0; i < MAX_CATCH_UP; i++) {
      const fresh = await db.subscription.findUnique({ where: { id: s.id }, select: { nextInvoiceDate: true, status: true } });
      if (!fresh?.nextInvoiceDate || fresh.nextInvoiceDate > today || fresh.status !== "ACTIVE") break;
      try {
        const invoiceId = await invoiceNextPeriod(db, s.id, { discounts });
        if (!invoiceId) break;
        count++;
        if (company?.autoConfirmInvoices) {
          await confirmInvoice(db, invoiceId);
          if (company.autoSendInvoices) await sendInvoice(db, invoiceId);
        }
      } catch (e) {
        errors.push(`${s.number}: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
  }
  return { name: "Billing run", count, errors };
}

/** Close or auto-renew subscriptions past their expiry date; expire old quotations. */
export async function handleExpiry(db: Db): Promise<JobResult> {
  const today = startOfDay();
  const errors: string[] = [];
  let count = 0;

  const expired = await db.subscription.findMany({
    where: { status: { in: ["ACTIVE", "PAUSED"] }, expiryDate: { lt: today } },
    include: { plan: true },
  });
  const reason = await db.closeReason.findFirst({ where: { name: "Contract ended" } });
  for (const s of expired) {
    try {
      if (s.plan.autoClose) {
        await db.subscription.update({
          where: { id: s.id },
          data: { status: "CLOSED", closedAt: new Date(), closeReasonId: reason?.id, nextInvoiceDate: null },
        });
        await logActivity(db, "subscription", s.id, "Subscription closed automatically at the end of its term.");
        count++;
      } else if (s.plan.renewable && s.status === "ACTIVE") {
        await renewSubscription(db, s.id);
        count++;
      }
    } catch (e) {
      errors.push(`${s.number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const quotes = await db.subscription.findMany({
    where: { status: "QUOTATION", quoteValidUntil: { lt: today } },
    select: { id: true },
  });
  const qReason = await db.closeReason.findFirst({ where: { name: "Quotation expired" } });
  for (const q of quotes) {
    await db.subscription.update({
      where: { id: q.id },
      data: { status: "CLOSED", closedAt: new Date(), closeReasonId: qReason?.id },
    });
    await logActivity(db, "subscription", q.id, "Quotation expired without being confirmed.");
    count++;
  }
  return { name: "Expiry & renewals", count, errors };
}

/** Email a reminder for invoices that are overdue by the configured number of days. */
export async function sendOverdueReminders(db: Db): Promise<JobResult> {
  const company = await db.organization.findFirst();
  const cutoff = addDays(startOfDay(), -(company?.overdueReminderDays ?? 3));
  const invoices = await db.invoice.findMany({
    where: { status: "CONFIRMED", dueDate: { lte: cutoff }, reminderSentAt: null },
    include: { customer: true },
    take: 500,
  });
  for (const inv of invoices) {
    await sendMail(db, {
      to: inv.customer.email,
      subject: `Reminder: invoice ${inv.number} is overdue`,
      heading: "Payment reminder",
      paragraphs: [
        `Hello ${inv.customer.name},`,
        `Invoice ${inv.number} was due on ${formatDate(inv.dueDate)}. ${formatMoney(inv.total - inv.amountPaid)} is still outstanding.`,
        "If you have already paid, please ignore this message.",
      ],
      button: { label: "Pay now", url: `${appUrl()}/portal/invoices/${inv.id}` },
      entity: { type: "invoice", id: inv.id },
    });
    await db.invoice.update({ where: { id: inv.id }, data: { reminderSentAt: new Date() } });
    await logActivity(db, "invoice", inv.id, "Overdue reminder emailed.");
  }
  return { name: "Overdue reminders", count: invoices.length, errors: [] };
}

/** Warn customers before a subscription with an end date reaches it. */
export async function sendRenewalReminders(db: Db): Promise<JobResult> {
  const company = await db.organization.findFirst();
  const today = startOfDay();
  const subs = await db.subscription.findMany({
    where: {
      status: "ACTIVE",
      renewalReminderAt: null,
      expiryDate: { gte: today, lte: addDays(today, company?.renewalReminderDays ?? 7) },
    },
    include: { customer: true, plan: true },
  });
  for (const s of subs) {
    const willRenew = !s.plan.autoClose && s.plan.renewable;
    await sendMail(db, {
      to: s.customer.email,
      subject: `Your subscription ${s.number} ${willRenew ? "renews" : "ends"} on ${formatDate(s.expiryDate)}`,
      heading: willRenew ? "Your subscription renews soon" : "Your subscription ends soon",
      paragraphs: [
        `Hello ${s.customer.name},`,
        willRenew
          ? `Your ${s.plan.name} subscription (${s.number}) will renew automatically on ${formatDate(s.expiryDate)}.`
          : `Your ${s.plan.name} subscription (${s.number}) ends on ${formatDate(s.expiryDate)}.`,
      ],
      button: { label: "Manage subscription", url: `${appUrl()}/portal/subscriptions/${s.id}` },
      entity: { type: "subscription", id: s.id },
    });
    await db.subscription.update({ where: { id: s.id }, data: { renewalReminderAt: new Date() } });
  }
  return { name: "Renewal reminders", count: subs.length, errors: [] };
}

/** Switch off discounts that expired or used up their limit. */
export async function expireDiscounts(db: Db): Promise<JobResult> {
  const today = startOfDay();
  const byDate = await db.discount.updateMany({ where: { active: true, endDate: { lt: today } }, data: { active: false } });
  const all = await db.discount.findMany({ where: { active: true, usageLimit: { not: null } } });
  const usedUp = all.filter((d) => d.usedCount >= d.usageLimit!);
  if (usedUp.length) await db.discount.updateMany({ where: { id: { in: usedUp.map((d) => d.id) } }, data: { active: false } });
  return { name: "Discount expiry", count: byDate.count + usedUp.length, errors: [] };
}

const running = new Set<string>();

/** Run every daily job for one company, in order. Safe to call repeatedly: each step is idempotent. */
export async function runCompanyJobs(db: Db): Promise<JobResult[]> {
  const org = await db.organization.findFirstOrThrow();
  if (running.has(org.id)) return [{ name: "Daily jobs", count: 0, errors: ["Already running"] }];
  running.add(org.id);
  try {
    const results: JobResult[] = [];
    results.push(await activateStarted(db));
    results.push(await expireDiscounts(db));
    results.push(await handleExpiry(db));
    results.push(await runBilling(db));
    results.push(await sendOverdueReminders(db));
    results.push(await sendRenewalReminders(db));
    return results;
  } finally {
    running.delete(org.id);
  }
}

/** Run the daily jobs for every registered company (scheduler and cron endpoint). */
export async function runDailyJobs(): Promise<JobResult[]> {
  const orgs = await rootDb.organization.findMany({ select: { id: true, name: true } });
  const totals = new Map<string, JobResult>();
  for (const org of orgs) {
    for (const r of await runCompanyJobs(scopedDb(org.id))) {
      const t = totals.get(r.name) ?? { name: r.name, count: 0, errors: [] };
      t.count += r.count;
      t.errors.push(...r.errors.map((e) => `${org.name}: ${e}`));
      totals.set(r.name, t);
    }
  }
  return [...totals.values()];
}

export { BillingError };
