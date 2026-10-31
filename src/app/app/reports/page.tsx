import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireBackoffice } from "@/lib/auth";
import { headline, monthlyRevenue } from "@/lib/metrics";
import { formatMoney } from "@/lib/money";
import { formatDate, parseInputDate, startOfDay } from "@/lib/dates";
import { METHOD_LABEL } from "@/lib/status";
import { Card, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { QueryTabs, SearchBar, param, withQuery, type SearchParams } from "@/components/list";
import { DonutChart, RevenueChart, TrendChart } from "@/components/charts";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireBackoffice();
  const sp = await searchParams;
  const tab = param(sp, "tab") || "summary";
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Active subscriptions, revenue, payments and overdue invoices in one place."
        actions={<QueryTabs base="/app/reports" sp={{ tab: param(sp, "tab") }} name="tab" tabs={[
          { value: "summary", label: "Summary" },
          { value: "subscriptions", label: "Subscriptions" },
          { value: "revenue", label: "Revenue & payments" },
          { value: "overdue", label: "Overdue" },
        ]} />}
      />
      {tab === "summary" && <Summary />}
      {tab === "subscriptions" && <Subscriptions sp={sp} />}
      {tab === "revenue" && <Revenue sp={sp} />}
      {tab === "overdue" && <Overdue sp={sp} />}
    </>
  );
}

async function Summary() {
  const { db } = await requireBackoffice();
  const [h, months] = await Promise.all([headline(db), monthlyRevenue(db, 12)]);
  const totalCollected = months.reduce((s, m) => s + m.collected, 0);
  const totalInvoiced = months.reduce((s, m) => s + m.invoiced, 0);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active subscriptions" value={h.active.toLocaleString("en-IN")} />
        <StatCard label="MRR / ARR" value={formatMoney(h.mrr)} hint={`ARR ${formatMoney(h.arr)}`} />
        <StatCard label="Collected (12 months)" value={formatMoney(totalCollected)} hint={`of ${formatMoney(totalInvoiced)} invoiced`} tone="good" />
        <StatCard label="Overdue" value={formatMoney(h.overdueAmount)} hint={`${h.overdueCount} invoices`} tone="danger" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Invoiced vs collected"><RevenueChart data={months.map((m) => ({ month: m.month, invoiced: Math.round(m.invoiced / 100), collected: Math.round(m.collected / 100) }))} /></Card>
        <Card title="New subscriptions per month"><TrendChart data={months.map((m) => ({ month: m.month, count: m.newSubscriptions }))} dataKey="count" name="New subscriptions" /></Card>
      </div>
      <Card title="Recurring revenue by plan" className="mt-5">
        <table className="table">
          <thead><tr><th>Plan</th><th className="text-right">Active subscriptions</th><th className="text-right">MRR</th><th className="text-right">Share</th></tr></thead>
          <tbody>
            {h.mrrByPlan.map((p) => (
              <tr key={p.planId}>
                <td><Link className="link" href={`/app/subscriptions?status=ACTIVE&planId=${p.planId}`}>{p.plan}</Link></td>
                <td className="text-right">{p.count.toLocaleString("en-IN")}</td>
                <td className="text-right tabular-nums">{formatMoney(p.mrr)}</td>
                <td className="text-right">{h.mrr ? ((p.mrr / h.mrr) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

async function Subscriptions({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const { db } = await requireBackoffice();
  const status = param(sp, "status");
  const planId = param(sp, "planId");
  const where: Prisma.SubscriptionWhereInput = {
    ...(status && { status: status as Prisma.EnumSubscriptionStatusFilter["equals"] }),
    ...(planId && { planId }),
  };
  const [plans, byStatus, byPlan] = await Promise.all([
    db.recurringPlan.findMany({ select: { id: true, name: true } }),
    db.subscription.groupBy({ by: ["status"], where, _count: true, _sum: { total: true } }),
    db.subscription.groupBy({ by: ["planId", "status"], where, _count: true, _sum: { total: true } }),
  ]);
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? "—";
  return (
    <>
      <SearchBar
        action="/app/reports"
        sp={sp}
        search={false}
        extraQuery="?tab=subscriptions"
        filters={[
          { name: "status", label: "Status", options: ["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "PAUSED", "CLOSED"].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
          { name: "planId", label: "Plan", options: plans.map((p) => ({ value: p.id, label: p.name })) },
        ]}
        extra={<input type="hidden" name="tab" value="subscriptions" />}
      />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="By status"><DonutChart data={byStatus.map((s) => ({ name: s.status, value: s._count }))} /></Card>
        <Card title="Grouped by plan and status" className="xl:col-span-2" actions={<LinkButton size="sm" href={withQuery("/api/reports/subscriptions", sp, { tab: null })}>Export CSV</LinkButton>}>
          <table className="table">
            <thead><tr><th>Plan</th><th>Status</th><th className="text-right">Count</th><th className="text-right">Recurring total</th></tr></thead>
            <tbody>
              {byPlan.sort((a, b) => planName(a.planId).localeCompare(planName(b.planId)) || a.status.localeCompare(b.status)).map((g) => (
                <tr key={g.planId + g.status}>
                  <td>{planName(g.planId)}</td>
                  <td>{g.status.charAt(0) + g.status.slice(1).toLowerCase()}</td>
                  <td className="text-right"><Link className="link" href={`/app/subscriptions?planId=${g.planId}&status=${g.status}`}>{g._count.toLocaleString("en-IN")}</Link></td>
                  <td className="text-right tabular-nums">{formatMoney(g._sum.total ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

async function Revenue({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const { db } = await requireBackoffice();
  const today = startOfDay();
  const from = parseInputDate(param(sp, "from")) ?? new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const to = parseInputDate(param(sp, "to")) ?? today;
  const dateWhere = { gte: from, lte: new Date(to.getTime() + 86399999) };
  const [byMethod, invoiced, collected] = await Promise.all([
    db.payment.groupBy({ by: ["method"], where: { date: dateWhere }, _sum: { amount: true }, _count: true }),
    db.invoice.aggregate({ where: { invoiceDate: dateWhere, status: { in: ["CONFIRMED", "PAID"] } }, _sum: { total: true, taxTotal: true, discountTotal: true }, _count: true }),
    db.payment.aggregate({ where: { date: dateWhere }, _sum: { amount: true }, _count: true }),
  ]);
  return (
    <>
      <SearchBar action="/app/reports" sp={{ ...sp, from: param(sp, "from") || from.toISOString().slice(0, 10), to: param(sp, "to") || to.toISOString().slice(0, 10) }} search={false} extraQuery="?tab=revenue" dateRange extra={<input type="hidden" name="tab" value="revenue" />} />
      <p className="mb-3 text-sm text-zinc-500">{formatDate(from)} – {formatDate(to)}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Invoiced" value={formatMoney(invoiced._sum.total ?? 0)} hint={`${invoiced._count} invoices`} />
        <StatCard label="Collected" value={formatMoney(collected._sum.amount ?? 0)} hint={`${collected._count} payments`} tone="good" />
        <StatCard label="Tax invoiced" value={formatMoney(invoiced._sum.taxTotal ?? 0)} />
        <StatCard label="Discounts given" value={formatMoney(invoiced._sum.discountTotal ?? 0)} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Payments by method"><DonutChart money data={byMethod.map((m) => ({ name: METHOD_LABEL[m.method], value: Math.round((m._sum.amount ?? 0) / 100) }))} /></Card>
        <Card title="Breakdown" actions={<LinkButton size="sm" href={withQuery("/api/reports/payments", sp, { tab: null })}>Export payments CSV</LinkButton>}>
          <table className="table">
            <thead><tr><th>Method</th><th className="text-right">Payments</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {byMethod.map((m) => (
                <tr key={m.method}><td>{METHOD_LABEL[m.method]}</td><td className="text-right">{m._count}</td><td className="text-right tabular-nums">{formatMoney(m._sum.amount ?? 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

async function Overdue({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const { db } = await requireBackoffice();
  const today = startOfDay();
  const q = param(sp, "q");
  const where: Prisma.InvoiceWhereInput = { status: "CONFIRMED", dueDate: { lt: today }, ...(q && { customer: { name: { contains: q } } }) };
  const [invoices, agg] = await Promise.all([
    db.invoice.findMany({ where, include: { customer: { select: { id: true, name: true, email: true } } }, orderBy: { dueDate: "asc" }, take: 100 }),
    db.invoice.aggregate({ where, _sum: { total: true, amountPaid: true }, _count: true }),
  ]);
  const buckets = [
    { label: "1–30 days", min: 1, max: 30 },
    { label: "31–60 days", min: 31, max: 60 },
    { label: "61–90 days", min: 61, max: 90 },
    { label: "90+ days", min: 91, max: Infinity },
  ].map((b) => ({ ...b, amount: 0, count: 0 }));
  const all = await db.invoice.findMany({ where, select: { dueDate: true, total: true, amountPaid: true } });
  for (const i of all) {
    const days = Math.floor((today.getTime() - i.dueDate.getTime()) / 86400000);
    const b = buckets.find((x) => days >= x.min && days <= x.max);
    if (b) {
      b.amount += i.total - i.amountPaid;
      b.count++;
    }
  }
  return (
    <>
      <SearchBar action="/app/reports" sp={sp} placeholder="Filter by customer…" extraQuery="?tab=overdue" extra={<input type="hidden" name="tab" value="overdue" />} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total overdue" value={formatMoney((agg._sum.total ?? 0) - (agg._sum.amountPaid ?? 0))} hint={`${agg._count} invoices`} tone="danger" />
        {buckets.map((b) => <StatCard key={b.label} label={b.label} value={formatMoney(b.amount)} hint={`${b.count} invoices`} />)}
      </div>
      <Card title="Oldest first" className="mt-5" actions={<LinkButton size="sm" href={withQuery("/api/reports/overdue", sp, { tab: null })}>Export CSV</LinkButton>}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Invoice</th><th>Customer</th><th>Email</th><th>Due</th><th className="text-right">Days late</th><th className="text-right">Amount due</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td><Link className="link" href={`/app/invoices/${i.id}`}>{i.number}</Link></td>
                  <td><Link className="link" href={`/app/customers/${i.customer.id}`}>{i.customer.name}</Link></td>
                  <td className="text-zinc-500">{i.customer.email}</td>
                  <td>{formatDate(i.dueDate)}</td>
                  <td className="text-right text-red-600">{Math.floor((today.getTime() - i.dueDate.getTime()) / 86400000)}</td>
                  <td className="text-right tabular-nums">{formatMoney(i.total - i.amountPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {agg._count > invoices.length && <p className="mt-2 text-xs text-zinc-500">Showing the 100 oldest. Export CSV for the full list.</p>}
      </Card>
    </>
  );
}
