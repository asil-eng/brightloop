import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { METHOD_LABEL, invoiceBadge } from "@/lib/status";
import { Alert, Badge, Card, Info, LinkButton, PageHeader } from "@/components/ui";

export default async function PortalInvoice({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { customer, db } = await requireCustomer();
  const { id } = await params;
  const { paid } = await searchParams;
  const inv = await db.invoice.findFirst({
    where: { id, customerId: customer.id, status: { not: "DRAFT" } },
    include: { lines: true, payments: { orderBy: { date: "asc" } }, subscription: { select: { id: true, number: true } } },
  });
  if (!inv) notFound();
  const company = await db.organization.findFirst();
  const due = inv.total - inv.amountPaid;

  return (
    <>
      <PageHeader
        title={`Invoice ${inv.number}`}
        breadcrumbs={[{ label: "Invoices", href: "/portal/invoices" }, { label: inv.number ?? "" }]}
        actions={
          <>
            <LinkButton href={`/api/invoices/${id}/pdf`} target="_blank">Print</LinkButton>
            <LinkButton href={`/api/invoices/${id}/pdf?download=1`}>Download PDF</LinkButton>
            {inv.status === "CONFIRMED" && <LinkButton href={`/portal/invoices/${id}/pay`} variant="accent">Pay {formatMoney(due)}</LinkButton>}
          </>
        }
      />
      {paid && <div className="mb-4"><Alert kind="success">Payment of {paid} received — thank you! A receipt is on its way to your inbox.</Alert></div>}
      <Card>
        <div className="flex flex-wrap justify-between gap-4 border-b border-zinc-100 pb-4">
          <div>
            <p className="text-lg font-semibold text-brand-700">{company?.name}</p>
            <p className="whitespace-pre-line text-sm text-zinc-500">{company?.address}</p>
          </div>
          <Badge {...invoiceBadge(inv)} />
        </div>
        <dl className="grid gap-4 py-4 sm:grid-cols-4">
          <Info label="Billed to">{customer.name}<span className="block whitespace-pre-line text-xs text-zinc-500">{customer.address}</span></Info>
          <Info label="Invoice date">{formatDate(inv.invoiceDate)}</Info>
          <Info label="Due date">{formatDate(inv.dueDate)}</Info>
          <Info label="Period">{inv.periodStart ? `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}` : "—"}</Info>
        </dl>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Discount</th><th>Taxes</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td className="text-right">{l.quantity}</td>
                  <td className="text-right tabular-nums">{formatMoney(l.unitPrice)}</td>
                  <td className="text-right tabular-nums text-emerald-700">{l.discountAmount ? `−${formatMoney(l.discountAmount)}` : "—"}</td>
                  <td className="text-zinc-500">{l.taxLabel}</td>
                  <td className="text-right tabular-nums">{formatMoney(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto mt-4 w-72 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-zinc-500">Untaxed amount</dt><dd>{formatMoney(inv.untaxed)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Taxes</dt><dd>{formatMoney(inv.taxTotal)}</dd></div>
          <div className="flex justify-between border-t border-zinc-200 pt-1 font-semibold"><dt>Total</dt><dd>{formatMoney(inv.total)}</dd></div>
          <div className="flex justify-between text-zinc-500"><dt>Paid</dt><dd>{formatMoney(inv.amountPaid)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Amount due</dt><dd>{formatMoney(due)}</dd></div>
        </dl>
        {inv.payments.length > 0 && (
          <div className="mt-5 border-t border-zinc-100 pt-4">
            <p className="label">Payments</p>
            <ul className="space-y-1 text-sm">
              {inv.payments.map((p) => (
                <li key={p.id}>{formatDate(p.date)} · {METHOD_LABEL[p.method]} · {formatMoney(p.amount)}{p.reference ? ` · ${p.reference}` : ""}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </>
  );
}
