import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate, periodLabel, startOfDay } from "@/lib/dates";
import { invoiceBadge } from "@/lib/status";
import { Badge, Card, Info, LinkButton, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { portalSubscriptionAction, toggleAddon } from "../../actions";

const UNIT = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" } as const;

function Op({ id, op, label, variant = "secondary", confirm }: { id: string; op: string; label: string; variant?: "primary" | "secondary" | "danger"; confirm?: string }) {
  return (
    <ActionForm action={portalSubscriptionAction} confirm={confirm}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </ActionForm>
  );
}

export default async function PortalSubscription({ params }: { params: Promise<{ id: string }> }) {
  const { customer, db } = await requireCustomer();
  const { id } = await params;
  const sub = await db.subscription.findFirst({
    where: { id, customerId: customer.id, status: { not: "DRAFT" } },
    include: { plan: true, paymentTerm: true, lines: { include: { taxes: true, product: true }, orderBy: { id: "asc" } } },
  });
  if (!sub) notFound();
  const [invoices, addons, reasons] = await Promise.all([
    db.invoice.findMany({ where: { subscriptionId: id, status: { not: "DRAFT" } }, orderBy: { invoiceDate: "desc" }, take: 12 }),
    db.product.findMany({ where: { type: "ADDON", active: true }, orderBy: { name: "asc" } }),
    db.closeReason.findMany({ where: { name: { notIn: ["Contract ended", "Quotation expired"] } }, orderBy: { name: "asc" } }),
  ]);

  const s = sub.status;
  const today = startOfDay();
  const running = s === "ACTIVE" || s === "PAUSED" || s === "CONFIRMED";
  const quoteValid = s === "QUOTATION" && (!sub.quoteValidUntil || sub.quoteValidUntil >= today);
  const activeAddons = new Map(sub.lines.filter((l) => l.product?.type === "ADDON").map((l) => [l.productId, l]));

  return (
    <>
      <PageHeader
        title={s === "QUOTATION" ? `Quotation ${sub.number}` : `Subscription ${sub.number}`}
        subtitle={`${sub.plan.name} · ${periodLabel(sub.plan.period, sub.plan.interval)}`}
        breadcrumbs={[{ label: "Subscriptions", href: "/portal/subscriptions" }, { label: sub.number }]}
        actions={<Badge status={s} />}
      />

      {s === "QUOTATION" && (
        <Card className="mb-5">
          {quoteValid ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">Please review the offer below. It&apos;s valid until <strong>{formatDate(sub.quoteValidUntil)}</strong>.</p>
              <div className="flex gap-2">
                <Op id={id} op="close" label="Decline" variant="secondary" confirm="Decline this quotation?" />
                <Op id={id} op="accept" label="Accept & subscribe" variant="primary" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-600">This quotation expired on {formatDate(sub.quoteValidUntil)}. Please contact us for a new one.</p>
          )}
        </Card>
      )}

      {running && (
        <Card className="mb-5" title="Manage">
          <div className="flex flex-wrap items-center gap-2">
            {s === "ACTIVE" && sub.plan.pausable && <Op id={id} op="pause" label="Pause subscription" confirm="Pause billing until you resume?" />}
            {s === "PAUSED" && <Op id={id} op="resume" label="Resume subscription" variant="primary" />}
            {sub.plan.renewable && sub.expiryDate && <Op id={id} op="renew" label="Renew now" />}
            {sub.plan.closable && (
              <ActionForm action={portalSubscriptionAction} confirm="Close this subscription? You won't be billed again." className="flex items-center gap-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="op" value="close" />
                <select name="reasonId" className="input w-auto" aria-label="Reason">
                  <option value="">Reason (optional)</option>
                  {reasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <SubmitButton variant="danger">Close subscription</SubmitButton>
              </ActionForm>
            )}
            {!sub.plan.pausable && !sub.plan.closable && !(sub.plan.renewable && sub.expiryDate) && (
              <p className="text-sm text-zinc-500">This plan runs for a fixed term and can&apos;t be changed online.</p>
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Info label="Start date">{formatDate(sub.startDate)}</Info>
              <Info label="Expiry date">{sub.expiryDate ? formatDate(sub.expiryDate) : "No end date"}</Info>
              <Info label="Next invoice">{s === "ACTIVE" ? formatDate(sub.nextInvoiceDate) : "—"}</Info>
              <Info label="Payment terms">{sub.paymentTerm?.name ?? "Immediate"}</Info>
              <Info label="Billing">{periodLabel(sub.plan.period, sub.plan.interval)}</Info>
              <Info label="Amount per period">{formatMoney(sub.total)}</Info>
            </dl>
          </Card>
          <Card title="What's included">
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th>Taxes</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {sub.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.description}</td>
                      <td className="text-right">{l.quantity}</td>
                      <td className="text-right tabular-nums">{formatMoney(l.unitPrice)}</td>
                      <td className="text-zinc-500">{l.taxes.map((t) => t.name).join(", ")}</td>
                      <td className="text-right tabular-nums">{formatMoney(l.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto mt-3 w-64 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-zinc-500">Untaxed</dt><dd>{formatMoney(sub.untaxed)}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Taxes</dt><dd>{formatMoney(sub.taxTotal)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Total per period</dt><dd>{formatMoney(sub.total)}</dd></div>
            </dl>
          </Card>
          {invoices.length > 0 && (
            <Card title="Invoices">
              <table className="table">
                <thead><tr><th>Invoice</th><th>Period</th><th className="text-right">Total</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td><Link className="link" href={`/portal/invoices/${i.id}`}>{i.number}</Link></td>
                      <td className="text-zinc-600">{formatDate(i.periodStart)} – {formatDate(i.periodEnd)}</td>
                      <td className="text-right tabular-nums">{formatMoney(i.total)}</td>
                      <td><Badge {...invoiceBadge(i)} /></td>
                      <td className="text-right">{i.status === "CONFIRMED" && <LinkButton size="sm" variant="accent" href={`/portal/invoices/${i.id}/pay`}>Pay</LinkButton>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {running && addons.length > 0 && (
          <Card title="Add-ons">
            <p className="mb-3 text-sm text-zinc-500">Switch add-ons on or off. Changes appear on your next invoice.</p>
            <ul className="space-y-3">
              {addons.map((a) => {
                const line = activeAddons.get(a.id);
                return (
                  <li key={a.id} className="rounded-md border border-zinc-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{a.name}</p>
                        <p className="text-xs text-zinc-500">{formatMoney(a.salesPrice)} per {UNIT[sub.plan.period]} · {a.notes.replace(/^Add-on:\s*/, "")}</p>
                      </div>
                      {line && <Badge status="ACTIVE" label={`On ×${line.quantity}`} />}
                    </div>
                    <ActionForm action={toggleAddon} className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="productId" value={a.id} />
                      {!line && <input name="quantity" type="number" min={Math.max(1, sub.plan.minQuantity)} defaultValue={Math.max(1, sub.plan.minQuantity)} className="input w-20" aria-label="Quantity" />}
                      <SubmitButton size="sm" variant={line ? "danger" : "primary"}>{line ? "Switch off" : "Switch on"}</SubmitButton>
                    </ActionForm>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
