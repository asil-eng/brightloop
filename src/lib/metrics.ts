import "server-only";
import type { Db } from "./db";
import { addDays, addMonths, monthlyFactor, startOfDay } from "./dates";

/** Monthly recurring revenue (untaxed) of active subscriptions, per plan and in total. */
export async function mrr(db: Db) {
  const [byPlan, plans] = await Promise.all([
    db.subscription.groupBy({ by: ["planId"], where: { status: "ACTIVE" }, _sum: { untaxed: true }, _count: true }),
    db.recurringPlan.findMany({ select: { id: true, name: true, period: true, interval: true } }),
  ]);
  const rows = byPlan.map((g) => {
    const p = plans.find((x) => x.id === g.planId)!;
    return { planId: p.id, plan: p.name, count: g._count, mrr: Math.round((g._sum.untaxed ?? 0) * monthlyFactor(p.period, p.interval)) };
  });
  return { total: rows.reduce((s, r) => s + r.mrr, 0), byPlan: rows.sort((a, b) => b.mrr - a.mrr) };
}

export async function headline(db: Db) {
  const today = startOfDay();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [active, paused, collectedMonth, outstanding, overdue, closed30, recurring] = await Promise.all([
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.subscription.count({ where: { status: "PAUSED" } }),
    db.payment.aggregate({ where: { date: { gte: monthStart } }, _sum: { amount: true } }),
    db.invoice.aggregate({ where: { status: "CONFIRMED" }, _sum: { total: true, amountPaid: true }, _count: true }),
    db.invoice.aggregate({ where: { status: "CONFIRMED", dueDate: { lt: today } }, _sum: { total: true, amountPaid: true }, _count: true }),
    db.subscription.count({ where: { status: "CLOSED", closedAt: { gte: addDays(today, -30) } } }),
    mrr(db),
  ]);
  return {
    active,
    paused,
    mrr: recurring.total,
    arr: recurring.total * 12,
    mrrByPlan: recurring.byPlan,
    collectedThisMonth: collectedMonth._sum.amount ?? 0,
    outstanding: (outstanding._sum.total ?? 0) - (outstanding._sum.amountPaid ?? 0),
    unpaidCount: outstanding._count,
    overdueAmount: (overdue._sum.total ?? 0) - (overdue._sum.amountPaid ?? 0),
    overdueCount: overdue._count,
    churnRate: active + closed30 > 0 ? closed30 / (active + closed30) : 0,
    closed30,
  };
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });

/** Invoiced and collected per month for the last `months` months (amounts in minor units). */
export async function monthlyRevenue(db: Db, months = 12) {
  const today = startOfDay();
  const start = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), -(months - 1));
  const [payments, invoices, newSubs] = await Promise.all([
    db.payment.findMany({ where: { date: { gte: start } }, select: { date: true, amount: true } }),
    db.invoice.findMany({ where: { invoiceDate: { gte: start }, status: { in: ["CONFIRMED", "PAID"] } }, select: { invoiceDate: true, total: true } }),
    db.subscription.findMany({ where: { startDate: { gte: start, lte: today }, status: { in: ["ACTIVE", "PAUSED", "CLOSED"] } }, select: { startDate: true } }),
  ]);
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = addMonths(start, i);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTH.format(d), invoiced: 0, collected: 0, newSubscriptions: 0 };
  });
  const find = (d: Date) => buckets.find((b) => b.key === `${d.getFullYear()}-${d.getMonth()}`);
  for (const p of payments) {
    const b = find(p.date);
    if (b) b.collected += p.amount;
  }
  for (const i of invoices) {
    const b = find(i.invoiceDate);
    if (b) b.invoiced += i.total;
  }
  for (const s of newSubs) {
    const b = find(s.startDate);
    if (b) b.newSubscriptions += 1;
  }
  return buckets;
}
