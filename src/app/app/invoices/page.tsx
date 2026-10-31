import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireBackoffice } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate, parseInputDate } from "@/lib/dates";
import { invoiceBadge } from "@/lib/status";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { PAGE_SIZE, Pagination, SearchBar, pageOf, param, type SearchParams } from "@/components/list";
import { INVOICE_FILTERS, invoiceStatusWhere } from "./filters";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireBackoffice();
  const sp = await searchParams;
  const page = pageOf(sp);
  const q = param(sp, "q");
  const status = param(sp, "status");
  const customerId = param(sp, "customerId");
  const subscriptionId = param(sp, "subscriptionId");
  const from = parseInputDate(param(sp, "from"));
  const to = parseInputDate(param(sp, "to"));

  const where: Prisma.InvoiceWhereInput = {
    ...invoiceStatusWhere(status),
    ...(q && { OR: [{ number: { contains: q } }, { customer: { name: { contains: q } } }, { subscription: { number: { contains: q } } }] }),
    ...(customerId && { customerId }),
    ...(subscriptionId && { subscriptionId }),
    ...((from || to) && { invoiceDate: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
  };

  const [invoices, total, sums] = await Promise.all([
    db.invoice.findMany({
      where,
      include: { customer: { select: { name: true } }, subscription: { select: { number: true } } },
      orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.invoice.count({ where }),
    db.invoice.aggregate({ where: { ...where, status: where.status ?? { not: "CANCELLED" } }, _sum: { total: true, amountPaid: true } }),
  ]);
  const invoiced = sums._sum.total ?? 0;
  const paid = sums._sum.amountPaid ?? 0;

  return (
    <>
      <PageHeader title="Invoices" subtitle="Created automatically from subscriptions on billing day." />
      <SearchBar
        action="/app/invoices"
        sp={sp}
        placeholder="Search invoice, customer or subscription…"
        dateRange
        filters={[{ name: "status", label: "Status", options: INVOICE_FILTERS }]}
        extra={
          <>
            {customerId && <input type="hidden" name="customerId" value={customerId} />}
            {subscriptionId && <input type="hidden" name="subscriptionId" value={subscriptionId} />}
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Invoiced (filtered)" value={formatMoney(invoiced)} hint={`${total.toLocaleString("en-IN")} invoices`} />
        <StatCard label="Paid" value={formatMoney(paid)} tone="good" />
        <StatCard label="Outstanding" value={formatMoney(invoiced - paid)} tone={invoiced - paid > 0 ? "danger" : "default"} />
      </div>
      <div className="card overflow-x-auto">
        {invoices.length === 0 ? (
          <EmptyState title="No invoices found" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Subscription</th>
                <th>Invoice date</th>
                <th>Due date</th>
                <th className="text-right">Total</th>
                <th className="text-right">Amount due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td><Link href={`/app/invoices/${i.id}`} className="link">{i.number ?? "Draft"}</Link></td>
                  <td>{i.customer.name}</td>
                  <td className="text-ink-secondary">{i.subscription?.number ?? "—"}</td>
                  <td className="whitespace-nowrap">{formatDate(i.invoiceDate)}</td>
                  <td className="whitespace-nowrap">{formatDate(i.dueDate)}</td>
                  <td className="text-right tabular-nums">{formatMoney(i.total)}</td>
                  <td className="text-right tabular-nums">{i.status === "CONFIRMED" ? formatMoney(i.total - i.amountPaid) : "—"}</td>
                  <td><Badge {...invoiceBadge(i)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination base="/app/invoices" sp={sp} page={page} total={total} />
      </div>
    </>
  );
}
