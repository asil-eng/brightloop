import Link from "next/link";
import { db } from "@/lib/db";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { invoiceBadge } from "@/lib/status";
import { Badge, Card, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { SubscriptionTable } from "./subscription-table";

export const metadata = { title: "My account" };

export default async function PortalHome() {
  const { customer } = await requireCustomer();
  const [subs, unpaid, agg] = await Promise.all([
    db.subscription.findMany({ where: { customerId: customer.id, status: { not: "DRAFT" } }, include: { plan: true }, orderBy: { createdAt: "desc" } }),
    db.invoice.findMany({ where: { customerId: customer.id, status: "CONFIRMED" }, orderBy: { dueDate: "asc" } }),
    db.invoice.aggregate({ where: { customerId: customer.id, status: "CONFIRMED" }, _sum: { total: true, amountPaid: true } }),
  ]);
  const active = subs.filter((s) => s.status === "ACTIVE");
  const next = active.filter((s) => s.nextInvoiceDate).sort((a, b) => a.nextInvoiceDate!.getTime() - b.nextInvoiceDate!.getTime())[0];
  const quotes = subs.filter((s) => s.status === "QUOTATION");
  const due = (agg._sum.total ?? 0) - (agg._sum.amountPaid ?? 0);

  return (
    <>
      <PageHeader title={`Welcome, ${customer.name.split(" ")[0]}`} subtitle="Your subscriptions and invoices with Brightloop Software." />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Active subscriptions" value={active.length} href="/portal/subscriptions" />
        <StatCard label="Amount due" value={formatMoney(due)} tone={due ? "danger" : "good"} hint={`${unpaid.length} unpaid invoice(s)`} href="/portal/invoices" />
        <StatCard label="Next invoice" value={next ? formatDate(next.nextInvoiceDate) : "—"} hint={next ? `${next.number} · ${formatMoney(next.total)}` : undefined} />
      </div>

      {quotes.length > 0 && (
        <Card title="Quotations waiting for you" className="mt-5">
          <ul className="divide-y divide-zinc-100">
            {quotes.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{q.number} · {q.plan.name} · {formatMoney(q.total)} — valid until {formatDate(q.quoteValidUntil)}</span>
                <LinkButton size="sm" variant="primary" href={`/portal/subscriptions/${q.id}`}>Review &amp; accept</LinkButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {unpaid.length > 0 && (
        <Card title="Invoices to pay" className="mt-5">
          <table className="table">
            <thead><tr><th>Invoice</th><th>Due</th><th className="text-right">Amount due</th><th>Status</th><th /></tr></thead>
            <tbody>
              {unpaid.map((i) => (
                <tr key={i.id}>
                  <td><Link className="link" href={`/portal/invoices/${i.id}`}>{i.number}</Link></td>
                  <td>{formatDate(i.dueDate)}</td>
                  <td className="text-right tabular-nums">{formatMoney(i.total - i.amountPaid)}</td>
                  <td><Badge {...invoiceBadge(i)} /></td>
                  <td className="text-right"><LinkButton size="sm" variant="accent" href={`/portal/invoices/${i.id}/pay`}>Pay now</LinkButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="My subscriptions" className="mt-5">
        <SubscriptionTable subs={subs} />
      </Card>
    </>
  );
}
