import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { METHOD_LABEL } from "@/lib/status";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PAGE_SIZE, Pagination, pageOf, type SearchParams } from "@/components/list";

export const metadata = { title: "My payments" };

export default async function PortalPayments({ searchParams }: { searchParams: SearchParams }) {
  const { customer, db } = await requireCustomer();
  const sp = await searchParams;
  const page = pageOf(sp);
  const where = { invoice: { customerId: customer.id } };
  const [payments, total] = await Promise.all([
    db.payment.findMany({ where, include: { invoice: { select: { id: true, number: true } } }, orderBy: { date: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.payment.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="My payments" />
      <Card>
        {payments.length === 0 ? <EmptyState title="No payments yet" /> : (
          <table className="table">
            <thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td><Link className="link" href={`/portal/invoices/${p.invoice.id}`}>{p.invoice.number}</Link></td>
                  <td>{METHOD_LABEL[p.method]}</td>
                  <td className="text-ink-secondary">{p.reference || "—"}</td>
                  <td className="text-right tabular-nums">{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination base="/portal/payments" sp={sp} page={page} total={total} />
      </Card>
    </>
  );
}
