import Link from "next/link";
import { requireBackoffice } from "@/lib/auth";
import { headline, monthlyRevenue } from "@/lib/metrics";
import { formatMoney } from "@/lib/money";
import { formatDate, startOfDay } from "@/lib/dates";
import { Card, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { DonutChart, RevenueChart } from "@/components/charts";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const user = await requireBackoffice();
  const { db } = user;
  const today = startOfDay();
  const [h, months, overdue, dueSoon, statusCounts, setup] = await Promise.all([
    headline(db),
    monthlyRevenue(db, 12),
    db.invoice.findMany({
      where: { status: "CONFIRMED", dueDate: { lt: today } },
      include: { customer: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    db.subscription.count({ where: { status: "ACTIVE", nextInvoiceDate: { lte: today } } }),
    db.subscription.groupBy({ by: ["status"], _count: true }),
    Promise.all([
      db.product.count(),
      db.recurringPlan.count(),
      db.customer.count(),
      db.user.count({ where: { role: { in: ["ADMIN", "STAFF"] } } }),
      db.subscription.count(),
    ]),
  ]);
  const [products, plans, customers, team, subscriptions] = setup;
  const steps = [
    { done: products > 0, label: "Add the products you sell", hint: "Services, add-ons and goods, with variants and prices.", href: "/app/products/new", adminOnly: true },
    { done: plans > 0, label: "Create a recurring plan", hint: "How often you bill: daily, weekly, monthly or yearly.", href: "/app/plans/new", adminOnly: true },
    { done: customers > 0, label: "Add your first customer", hint: "They get an email with their login to your customer portal.", href: "/app/customers/new" },
    { done: subscriptions > 0, label: "Create a quotation or subscription", hint: "Billing then runs automatically.", href: "/app/subscriptions/new" },
    { done: team > 1, label: "Invite your team", hint: "Staff handle day-to-day work with limited access.", href: "/app/settings", adminOnly: true },
  ].filter((s) => !s.adminOnly || user.role === "ADMIN");
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}`}
        subtitle={`Here's how ${user.org.name} is doing today, ${formatDate(today)}.`}
        actions={<LinkButton href="/app/reports" variant="secondary">Full reports</LinkButton>}
      />

      {remaining > 0 && (
        <Card title={`Get started · ${steps.length - remaining} of ${steps.length} done`} className="mb-5">
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link href={s.href} className={`flex gap-3 rounded-md border p-3 transition ${s.done ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 hover:border-brand-200 hover:bg-brand-50"}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.done ? "bg-emerald-600 text-white" : "bg-brand-100 text-brand-700"}`}>{s.done ? "✓" : i + 1}</span>
                  <span>
                    <span className={`block text-sm font-medium ${s.done ? "text-emerald-800 line-through" : "text-zinc-900"}`}>{s.label}</span>
                    <span className="text-xs text-zinc-500">{s.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active subscriptions" value={h.active.toLocaleString("en-IN")} hint={`${h.paused} paused`} href="/app/subscriptions?status=ACTIVE" />
        <StatCard label="Monthly recurring revenue" value={formatMoney(h.mrr)} hint={`ARR ${formatMoney(h.arr)}`} href="/app/reports" />
        <StatCard label="Collected this month" value={formatMoney(h.collectedThisMonth)} tone="good" href="/app/payments" />
        <StatCard label="Still owed" value={formatMoney(h.outstanding)} hint={`${h.unpaidCount.toLocaleString("en-IN")} unpaid invoices`} href="/app/invoices?status=UNPAID" />
        <StatCard label="Overdue" value={formatMoney(h.overdueAmount)} hint={`${h.overdueCount.toLocaleString("en-IN")} invoices past due`} tone={h.overdueCount ? "danger" : "default"} href="/app/invoices?status=OVERDUE" />
        <StatCard label="Churn (30 days)" value={`${(h.churnRate * 100).toFixed(1)}%`} hint={`${h.closed30} closed`} />
        <StatCard label="Due for billing now" value={dueSoon.toLocaleString("en-IN")} hint={dueSoon ? "Will be invoiced on the next run" : "Everything is billed"} href="/app/settings" />
        <StatCard label="Average revenue / subscription" value={formatMoney(h.active ? Math.round(h.mrr / h.active) : 0)} hint="per month" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card title="Revenue — last 12 months" className="xl:col-span-2">
          <RevenueChart data={months.map((m) => ({ month: m.month, invoiced: Math.round(m.invoiced / 100), collected: Math.round(m.collected / 100) }))} />
        </Card>
        <Card title="Subscriptions by status">
          <DonutChart data={statusCounts.map((s) => ({ name: s.status.charAt(0) + s.status.slice(1).toLowerCase(), value: s._count }))} />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card title="Overdue invoices to chase" className="xl:col-span-2" actions={<Link href="/app/invoices?status=OVERDUE" className="text-xs link">View all</Link>}>
          {overdue.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing overdue. 🎉</p>
          ) : (
            <table className="table">
              <thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th className="text-right">Days late</th><th className="text-right">Amount due</th></tr></thead>
              <tbody>
                {overdue.map((i) => (
                  <tr key={i.id}>
                    <td><Link className="link" href={`/app/invoices/${i.id}`}>{i.number}</Link></td>
                    <td>{i.customer.name}</td>
                    <td>{formatDate(i.dueDate)}</td>
                    <td className="text-right text-red-600">{Math.floor((today.getTime() - i.dueDate.getTime()) / 86400000)}</td>
                    <td className="text-right tabular-nums">{formatMoney(i.total - i.amountPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="MRR by plan">
          <DonutChart money data={h.mrrByPlan.map((p) => ({ name: p.plan, value: Math.round(p.mrr / 100) }))} />
        </Card>
      </div>
    </>
  );
}
