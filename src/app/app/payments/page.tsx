import Link from "next/link";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { requireBackoffice } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate, parseInputDate } from "@/lib/dates";
import { METHOD_LABEL } from "@/lib/status";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { PAGE_SIZE, Pagination, SearchBar, pageOf, param, type SearchParams } from "@/components/list";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireBackoffice();
  const sp = await searchParams;
  const page = pageOf(sp);
  const q = param(sp, "q");
  const method = param(sp, "method") as PaymentMethod | "";
  const customerId = param(sp, "customerId");
  const from = parseInputDate(param(sp, "from"));
  const to = parseInputDate(param(sp, "to"));
  const where: Prisma.PaymentWhereInput = {
    ...(q && { OR: [{ number: { contains: q } }, { reference: { contains: q } }, { invoice: { number: { contains: q } } }, { invoice: { customer: { name: { contains: q } } } }] }),
    ...(method && method in METHOD_LABEL && { method }),
    ...(customerId && { invoice: { customerId } }),
    ...((from || to) && { date: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
  };
  const [payments, total, sum] = await Promise.all([
    db.payment.findMany({
      where,
      include: { invoice: { select: { id: true, number: true, customer: { select: { name: true } } } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.payment.count({ where }),
    db.payment.aggregate({ where, _sum: { amount: true } }),
  ]);

  return (
    <>
      <PageHeader title="Payments" subtitle="Every payment received, matched to its invoice." />
      <SearchBar
        action="/app/payments"
        sp={sp}
        placeholder="Search payment, reference, invoice or customer…"
        dateRange
        filters={[{ name: "method", label: "Method", options: Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label })) }]}
        extra={customerId && <input type="hidden" name="customerId" value={customerId} />}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Received (filtered)" value={formatMoney(sum._sum.amount ?? 0)} hint={`${total.toLocaleString("en-IN")} payments`} tone="good" />
      </div>
      <div className="card overflow-x-auto">
        {payments.length === 0 ? <EmptyState title="No payments found" /> : (
          <table className="table">
            <thead><tr><th>Number</th><th>Date</th><th>Customer</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.number}</td>
                  <td className="whitespace-nowrap">{formatDate(p.date)}</td>
                  <td>{p.invoice.customer.name}</td>
                  <td><Link className="link" href={`/app/invoices/${p.invoice.id}`}>{p.invoice.number}</Link></td>
                  <td>{METHOD_LABEL[p.method]}</td>
                  <td className="text-zinc-500">{p.reference || "—"}</td>
                  <td className="text-zinc-500">{p.note || "—"}</td>
                  <td className="text-right tabular-nums">{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination base="/app/payments" sp={sp} page={page} total={total} />
      </div>
    </>
  );
}
