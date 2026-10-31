import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBackoffice } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { formatDate, periodLabel, startOfDay } from "@/lib/dates";
import { SUBSCRIPTION_STAGES, invoiceBadge } from "@/lib/status";
import { discountIsValid } from "@/lib/pricing";
import { loadDiscountRules } from "@/lib/billing";
import { Badge, Card, Info, PageHeader, SmartButton, StatusBar } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { Chatter } from "@/components/chatter";
import { SubscriptionForm } from "../subscription-form";
import { subscriptionAction, updateSubscription } from "../actions";

function ActionButton({ id, op, label, variant = "secondary", confirm }: { id: string; op: string; label: string; variant?: "primary" | "secondary" | "danger" | "accent"; confirm?: string }) {
  return (
    <ActionForm action={subscriptionAction} confirm={confirm}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton variant={variant} size="sm">{label}</SubmitButton>
    </ActionForm>
  );
}

export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireBackoffice();
  const { id } = await params;
  const sub = await db.subscription.findUnique({
    where: { id },
    include: {
      customer: true,
      plan: true,
      paymentTerm: true,
      salesperson: true,
      template: true,
      closeReason: true,
      lines: { include: { taxes: true }, orderBy: { id: "asc" } },
    },
  });
  if (!sub) notFound();

  const [{ products, taxes }, customers, plans, terms, reasons, invoices, invoiceAgg, discountRules] = await Promise.all([
    loadCatalog(db),
    db.customer.findMany({ select: { id: true, name: true, company: true }, orderBy: { name: "asc" } }),
    db.recurringPlan.findMany({ orderBy: { name: "asc" } }),
    db.paymentTerm.findMany({ orderBy: { dueDays: "asc" } }),
    db.closeReason.findMany({ orderBy: { name: "asc" } }),
    db.invoice.findMany({ where: { subscriptionId: id }, orderBy: { invoiceDate: "desc" }, take: 8 }),
    db.invoice.aggregate({ where: { subscriptionId: id, status: { not: "CANCELLED" } }, _count: true, _sum: { total: true, amountPaid: true } }),
    loadDiscountRules(db),
  ]);

  const today = startOfDay();
  const productIds = new Set(sub.lines.map((l) => l.productId).filter(Boolean));
  const discounts = discountRules.filter(
    (d) =>
      discountIsValid(d, today) &&
      (d.scope === "SUBSCRIPTION" ? d.subscriptionIds.length === 0 || d.subscriptionIds.includes(sub.id) : d.productIds.some((p) => productIds.has(p))),
  );

  const s = sub.status;
  const isQuote = s === "DRAFT" || s === "QUOTATION";
  const stage = s === "PAUSED" ? "ACTIVE" : s;
  const expired = sub.expiryDate && sub.expiryDate < today;
  const canClose = s !== "CLOSED" && (isQuote || sub.plan.closable || expired);

  return (
    <>
      <PageHeader
        title={sub.number}
        subtitle={`${sub.customer.name} · ${sub.plan.name}`}
        breadcrumbs={[{ label: "Subscriptions", href: "/app/subscriptions" }, { label: sub.number }]}
      />

      {/* Action bar + status bar, as on an Odoo form */}
      <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {(s === "DRAFT" || s === "QUOTATION") && <ActionButton id={id} op="send" label={s === "DRAFT" ? "Send quotation" : "Resend quotation"} variant={s === "DRAFT" ? "primary" : "secondary"} />}
          {isQuote && <ActionButton id={id} op="confirm" label="Confirm" variant={s === "QUOTATION" ? "primary" : "secondary"} />}
          {s === "CONFIRMED" && <ActionButton id={id} op="activate" label="Start now" variant="primary" />}
          {(s === "CONFIRMED" || s === "ACTIVE") && <ActionButton id={id} op="invoice" label="Create invoice" />}
          {s === "ACTIVE" && sub.plan.pausable && <ActionButton id={id} op="pause" label="Pause" />}
          {s === "PAUSED" && <ActionButton id={id} op="resume" label="Resume" variant="primary" />}
          {sub.plan.renewable && sub.expiryDate && ["ACTIVE", "PAUSED", "CLOSED"].includes(s) && <ActionButton id={id} op="renew" label="Renew" />}
          {canClose && (
            <ActionForm action={subscriptionAction} confirm="Close this subscription? No further invoices will be created." className="flex items-center gap-1">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="op" value="close" />
              <select name="reasonId" className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs" aria-label="Close reason">
                <option value="">Reason…</option>
                {reasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <SubmitButton variant="danger" size="sm">{isQuote ? "Cancel quotation" : "Close"}</SubmitButton>
            </ActionForm>
          )}
        </div>
        <div className="flex items-center gap-2">
          {s === "PAUSED" && <Badge status="PAUSED" />}
          <StatusBar stages={SUBSCRIPTION_STAGES} current={stage} />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <SmartButton href={`/app/invoices?subscriptionId=${id}`} label="Invoices" value={invoiceAgg._count} />
        <SmartButton href={`/app/invoices?subscriptionId=${id}`} label="Invoiced" value={formatMoney(invoiceAgg._sum.total ?? 0)} />
        <SmartButton href={`/app/invoices?subscriptionId=${id}&status=UNPAID`} label="Outstanding" value={formatMoney((invoiceAgg._sum.total ?? 0) - (invoiceAgg._sum.amountPaid ?? 0))} />
        <SmartButton href={`/app/customers/${sub.customerId}`} label="Customer" value={sub.customer.name} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Info label="Customer"><Link href={`/app/customers/${sub.customerId}`} className="link">{sub.customer.name}</Link></Info>
              <Info label="Plan">{sub.plan.name} · {periodLabel(sub.plan.period, sub.plan.interval)}</Info>
              <Info label="Payment terms">{sub.paymentTerm?.name ?? "Immediate"}</Info>
              <Info label="Start date">{formatDate(sub.startDate)}</Info>
              <Info label="Expiry date">{sub.expiryDate ? formatDate(sub.expiryDate) : "No end date"}{expired && s !== "CLOSED" ? " (ended)" : ""}</Info>
              <Info label="Next invoice">{s === "ACTIVE" || s === "CONFIRMED" ? formatDate(sub.nextInvoiceDate) : "—"}</Info>
              {isQuote && <Info label="Quotation valid until">{formatDate(sub.quoteValidUntil)}</Info>}
              <Info label="Salesperson">{sub.salesperson?.name ?? "—"}</Info>
              {sub.template && <Info label="Template">{sub.template.name}</Info>}
              {s === "CLOSED" && <Info label="Closed">{formatDate(sub.closedAt)}{sub.closeReason ? ` — ${sub.closeReason.name}` : ""}</Info>}
              <Info label="Plan rules">
                <span className="text-xs text-zinc-600">
                  {[sub.plan.autoClose && "auto-close", sub.plan.closable && "closable", sub.plan.pausable && "pausable", sub.plan.renewable && "renewable"].filter(Boolean).join(" · ") || "—"}
                </span>
              </Info>
            </dl>
          </Card>

          <Card title={isQuote ? "Quotation" : s === "CLOSED" ? "Lines" : "Lines (changes apply from the next invoice)"}>
            {s === "CLOSED" ? (
              <ReadOnlyLines lines={sub.lines} totals={sub} />
            ) : (
              <SubscriptionForm
                action={updateSubscription}
                values={{ ...sub, lines: sub.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxIds: l.taxes.map((t) => t.id) })) }}
                customers={customers}
                plans={plans}
                terms={terms}
                products={products}
                taxes={taxes}
                headerLocked={!isQuote}
                minQuantity={sub.plan.minQuantity}
              />
            )}
          </Card>

          <Card title="Recent invoices" actions={<Link href={`/app/invoices?subscriptionId=${id}`} className="text-xs link">View all</Link>}>
            {invoices.length === 0 ? (
              <p className="text-sm text-zinc-500">No invoices yet.</p>
            ) : (
              <table className="table">
                <thead><tr><th>Number</th><th>Period</th><th>Due</th><th className="text-right">Total</th><th>Status</th></tr></thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td><Link className="link" href={`/app/invoices/${i.id}`}>{i.number ?? "Draft"}</Link></td>
                      <td className="whitespace-nowrap text-zinc-600">{formatDate(i.periodStart)} – {formatDate(i.periodEnd)}</td>
                      <td>{formatDate(i.dueDate)}</td>
                      <td className="text-right tabular-nums">{formatMoney(i.total)}</td>
                      <td><Badge {...invoiceBadge(i)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Discounts on the next invoice">
            {discounts.length === 0 ? (
              <p className="text-sm text-zinc-500">No discount currently applies.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {discounts.map((d) => (
                  <li key={d.id} className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-900">
                    <span className="font-medium">{d.name}</span>
                    <span className="block text-xs">
                      {d.type === "PERCENT" ? `${d.value}% off` : `${formatMoney(d.value)} off`}
                      {d.minQuantity ? ` · min qty ${d.minQuantity}` : ""}
                      {d.minPurchase ? ` · min ${formatMoney(d.minPurchase)}` : ""}
                      {d.endDate ? ` · until ${formatDate(d.endDate)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-zinc-500">Applied automatically when the conditions are met.</p>
          </Card>
          <Chatter entityType="subscription" entityId={id} path={`/app/subscriptions/${id}`} />
        </div>
      </div>
    </>
  );
}

function ReadOnlyLines({ lines, totals }: { lines: { id: string; description: string; quantity: number; unitPrice: number; subtotal: number; taxes: { name: string }[] }[]; totals: { untaxed: number; taxTotal: number; total: number } }) {
  return (
    <>
      <table className="table">
        <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th>Taxes</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {lines.map((l) => (
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
      <dl className="ml-auto mt-3 w-64 space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-zinc-500">Untaxed</dt><dd>{formatMoney(totals.untaxed)}</dd></div>
        <div className="flex justify-between"><dt className="text-zinc-500">Taxes</dt><dd>{formatMoney(totals.taxTotal)}</dd></div>
        <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{formatMoney(totals.total)}</dd></div>
      </dl>
    </>
  );
}
