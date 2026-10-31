import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireBackoffice } from "@/lib/auth";
import { formatMoney, toMajor } from "@/lib/money";
import { formatDate, formatDateTime, toInputDate } from "@/lib/dates";
import { INVOICE_STAGES, METHOD_LABEL, invoiceBadge, isOverdue } from "@/lib/status";
import { Badge, Card, Field, Info, LinkButton, PageHeader, StatusBar } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { Chatter } from "@/components/chatter";
import { invoiceAction, recordPayment } from "../actions";

function Op({ id, op, label, variant = "secondary", confirm }: { id: string; op: string; label: string; variant?: "primary" | "secondary" | "danger"; confirm?: string }) {
  return (
    <ActionForm action={invoiceAction} confirm={confirm}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton size="sm" variant={variant}>{label}</SubmitButton>
    </ActionForm>
  );
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireBackoffice();
  const { id } = await params;
  const inv = await db.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      subscription: { select: { id: true, number: true } },
      lines: { include: { discount: { select: { name: true } } } },
      payments: { orderBy: { date: "asc" }, include: { createdBy: { select: { name: true } } } },
    },
  });
  if (!inv) notFound();
  const due = inv.total - inv.amountPaid;
  const badge = invoiceBadge(inv);

  return (
    <>
      <PageHeader
        title={inv.number ?? "Draft invoice"}
        subtitle={inv.customer.name}
        breadcrumbs={[{ label: "Invoices", href: "/app/invoices" }, { label: inv.number ?? "Draft" }]}
      />
      <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {inv.status === "DRAFT" && <Op id={id} op="confirm" label="Confirm" variant="primary" />}
          {inv.status !== "CANCELLED" && <Op id={id} op="send" label={inv.sentAt ? "Resend by email" : "Send by email"} variant={inv.status === "CONFIRMED" && !inv.sentAt ? "primary" : "secondary"} />}
          <LinkButton size="sm" href={`/api/invoices/${id}/pdf`} target="_blank">Print</LinkButton>
          <LinkButton size="sm" href={`/api/invoices/${id}/pdf?download=1`}>Download PDF</LinkButton>
          {(inv.status === "DRAFT" || (inv.status === "CONFIRMED" && inv.amountPaid === 0)) && (
            <Op id={id} op="cancel" label="Cancel" variant="danger" confirm="Cancel this invoice? The billing period can then be invoiced again." />
          )}
        </div>
        <div className="flex items-center gap-2">
          {badge.status !== inv.status && <Badge {...badge} />}
          {inv.status === "CANCELLED" ? <Badge status="CANCELLED" /> : <StatusBar stages={INVOICE_STAGES} current={inv.status} />}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Info label="Customer">
                <Link href={`/app/customers/${inv.customerId}`} className="link">{inv.customer.name}</Link>
                <span className="block text-xs text-zinc-500">{inv.customer.email}</span>
              </Info>
              <Info label="Invoice date">{formatDate(inv.invoiceDate)}</Info>
              <Info label="Due date">
                <span className={isOverdue(inv) ? "font-medium text-red-600" : ""}>{formatDate(inv.dueDate)}</span>
              </Info>
              <Info label="Subscription">{inv.subscription ? <Link className="link" href={`/app/subscriptions/${inv.subscription.id}`}>{inv.subscription.number}</Link> : "—"}</Info>
              <Info label="Billing period">{inv.periodStart ? `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}` : "—"}</Info>
              <Info label="Sent">{inv.sentAt ? formatDateTime(inv.sentAt) : "Not sent"}</Info>
            </dl>
          </Card>

          <Card title="Invoice lines">
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Discount</th><th>Taxes</th><th className="text-right">Tax</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.description}{l.discount && <span className="block text-xs text-emerald-700">{l.discount.name}</span>}</td>
                      <td className="text-right">{l.quantity}</td>
                      <td className="text-right tabular-nums">{formatMoney(l.unitPrice)}</td>
                      <td className="text-right tabular-nums text-emerald-700">{l.discountAmount ? `−${formatMoney(l.discountAmount)}` : "—"}</td>
                      <td className="text-zinc-500">{l.taxLabel || "—"}</td>
                      <td className="text-right tabular-nums">{formatMoney(l.taxAmount)}</td>
                      <td className="text-right tabular-nums">{formatMoney(l.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto mt-4 w-72 space-y-1 text-sm">
              {inv.discountTotal > 0 && <div className="flex justify-between text-emerald-700"><dt>Discounts applied</dt><dd className="tabular-nums">−{formatMoney(inv.discountTotal)}</dd></div>}
              <div className="flex justify-between"><dt className="text-zinc-500">Untaxed amount</dt><dd className="tabular-nums">{formatMoney(inv.untaxed)}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Taxes</dt><dd className="tabular-nums">{formatMoney(inv.taxTotal)}</dd></div>
              <div className="flex justify-between border-t border-zinc-200 pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(inv.total)}</dd></div>
              <div className="flex justify-between text-zinc-500"><dt>Paid</dt><dd className="tabular-nums">{formatMoney(inv.amountPaid)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Amount due</dt><dd className={`tabular-nums ${due > 0 && inv.status === "CONFIRMED" ? "text-red-600" : ""}`}>{formatMoney(inv.status === "CANCELLED" ? 0 : due)}</dd></div>
            </dl>
          </Card>

          <Card title="Payments">
            {inv.payments.length === 0 ? (
              <p className="text-sm text-zinc-500">No payments yet.</p>
            ) : (
              <table className="table">
                <thead><tr><th>Number</th><th>Date</th><th>Method</th><th>Reference</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.number}</td>
                      <td>{formatDate(p.date)}</td>
                      <td>{METHOD_LABEL[p.method]}</td>
                      <td className="text-zinc-500">{p.reference || "—"}</td>
                      <td className="text-zinc-500">{p.note || "—"}</td>
                      <td className="text-right tabular-nums">{formatMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {inv.status === "CONFIRMED" && (
            <Card title="Record a payment">
              <ActionForm action={recordPayment} className="space-y-3">
                <input type="hidden" name="invoiceId" value={id} />
                <Field label="Amount (₹)"><input name="amount" type="number" step="0.01" min="0.01" max={toMajor(due)} defaultValue={toMajor(due)} required className="input" /></Field>
                <Field label="Method">
                  <select name="method" className="input" defaultValue="BANK_TRANSFER">
                    {Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Payment date"><input name="date" type="date" defaultValue={toInputDate(new Date())} required className="input" /></Field>
                <Field label="Reference"><input name="reference" placeholder="e.g. UTR / cheque no." className="input" /></Field>
                <Field label="Note"><textarea name="note" rows={2} className="input" /></Field>
                <SubmitButton>Record payment</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Chatter entityType="invoice" entityId={id} path={`/app/invoices/${id}`} />
        </div>
      </div>
    </>
  );
}
