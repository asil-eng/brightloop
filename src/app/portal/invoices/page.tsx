import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { invoiceBadge } from "@/lib/status";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { PAGE_SIZE, Pagination, pageOf, type SearchParams } from "@/components/list";

export const metadata = { title: "My invoices" };

export default async function PortalInvoices({ searchParams }: { searchParams: SearchParams }) {
  const { customer, db } = await requireCustomer();
  const sp = await searchParams;
  const page = pageOf(sp);
  const where = { customerId: customer.id, status: { in: ["CONFIRMED" as const, "PAID" as const] } };
  const [invoices, total] = await Promise.all([
    db.invoice.findMany({ where, include: { subscription: { select: { number: true } } }, orderBy: { invoiceDate: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.invoice.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="My invoices" />
      <Card>
        {invoices.length === 0 ? <EmptyState title="No invoices yet" /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Invoice</th><th>Subscription</th><th>Date</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Due</th><th>Status</th><th /></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td><Link className="link" href={`/portal/invoices/${i.id}`}>{i.number}</Link></td>
                    <td className="text-zinc-500">{i.subscription?.number ?? "—"}</td>
                    <td>{formatDate(i.invoiceDate)}</td>
                    <td>{formatDate(i.dueDate)}</td>
                    <td className="text-right tabular-nums">{formatMoney(i.total)}</td>
                    <td className="text-right tabular-nums">{i.status === "CONFIRMED" ? formatMoney(i.total - i.amountPaid) : "—"}</td>
                    <td><Badge {...invoiceBadge(i)} /></td>
                    <td className="whitespace-nowrap text-right">
                      <a className="mr-2 text-xs link" href={`/api/invoices/${i.id}/pdf?download=1`}>PDF</a>
                      {i.status === "CONFIRMED" && <LinkButton size="sm" variant="accent" href={`/portal/invoices/${i.id}/pay`}>Pay now</LinkButton>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination base="/portal/invoices" sp={sp} page={page} total={total} />
      </Card>
    </>
  );
}
