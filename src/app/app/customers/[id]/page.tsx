import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBackoffice } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Badge, Card, LinkButton, PageHeader, SmartButton } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { Chatter } from "@/components/chatter";
import { CustomerForm } from "../customer-form";
import { resendLogin, updateCustomer } from "../actions";
import { invoiceBadge } from "@/lib/status";
import { companyEmailConnected } from "@/lib/mail";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ login?: string }> }) {
  const { db, org } = await requireBackoffice();
  const { id } = await params;
  const { login } = await searchParams;
  const emailConnected = companyEmailConnected(org);
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      user: true,
      subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 20 },
      invoices: { orderBy: { invoiceDate: "desc" }, take: 10 },
    },
  });
  if (!customer) notFound();
  const [subCount, invoiceAgg, paid] = await Promise.all([
    db.subscription.count({ where: { customerId: id } }),
    db.invoice.aggregate({ where: { customerId: id, status: { in: ["CONFIRMED", "PAID"] } }, _sum: { total: true, amountPaid: true }, _count: true }),
    db.payment.aggregate({ where: { invoice: { customerId: id } }, _sum: { amount: true } }),
  ]);
  const outstanding = (invoiceAgg._sum.total ?? 0) - (invoiceAgg._sum.amountPaid ?? 0);

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={customer.company}
        breadcrumbs={[{ label: "Customers", href: "/app/customers" }, { label: customer.name }]}
        actions={<LinkButton href={`/app/subscriptions/new?customerId=${customer.id}`} variant="primary">New subscription</LinkButton>}
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <SmartButton href={`/app/subscriptions?customerId=${id}`} label="Subscriptions" value={subCount} />
        <SmartButton href={`/app/invoices?customerId=${id}`} label="Invoiced" value={formatMoney(invoiceAgg._sum.total ?? 0)} />
        <SmartButton href={`/app/payments?customerId=${id}`} label="Paid" value={formatMoney(paid._sum.amount ?? 0)} />
        <SmartButton href={`/app/invoices?customerId=${id}&status=UNPAID`} label="Outstanding" value={formatMoney(outstanding)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card title="Details"><CustomerForm action={updateCustomer} customer={customer} /></Card>
          <Card title="Subscriptions">
            <table className="table">
              <thead><tr><th>Number</th><th>Plan</th><th>Start</th><th className="text-right">Total</th><th>Status</th></tr></thead>
              <tbody>
                {customer.subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td><Link className="link" href={`/app/subscriptions/${s.id}`}>{s.number}</Link></td>
                    <td>{s.plan.name}</td>
                    <td>{formatDate(s.startDate)}</td>
                    <td className="text-right tabular-nums">{formatMoney(s.total)}</td>
                    <td><Badge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Recent invoices">
            <table className="table">
              <thead><tr><th>Number</th><th>Date</th><th>Due</th><th className="text-right">Total</th><th>Status</th></tr></thead>
              <tbody>
                {customer.invoices.map((i) => (
                  <tr key={i.id}>
                    <td><Link className="link" href={`/app/invoices/${i.id}`}>{i.number ?? "Draft"}</Link></td>
                    <td>{formatDate(i.invoiceDate)}</td>
                    <td>{formatDate(i.dueDate)}</td>
                    <td className="text-right tabular-nums">{formatMoney(i.total)}</td>
                    <td><Badge {...invoiceBadge(i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="Customer login">
            {customer.user?.passwordHash ? (
              <p className="text-sm text-ink-secondary">✓ Active. Logs in to the customer portal as <span className="font-medium">{customer.user.email}</span>.</p>
            ) : (
              <p className="mb-3 text-sm text-ink-secondary">
                {!customer.user
                  ? "This customer doesn't have a login yet."
                  : emailConnected
                    ? "Login details were emailed. Waiting for the customer to set their password."
                    : "Waiting for the customer to set their password."}
              </p>
            )}
            {!customer.user?.passwordHash && !emailConnected && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                {login === "pending" ? "Customer created. " : ""}Your company email isn&apos;t connected, so login details can&apos;t be emailed.
                Get a one-time login link below and send it to the customer yourself, or{" "}
                {org && <Link href="/app/settings#email" className="font-medium underline">connect your email</Link>}.
              </div>
            )}
            {!customer.user?.passwordHash && (
              <ActionForm action={resendLogin}>
                <input type="hidden" name="id" value={customer.id} />
                <SubmitButton size="sm" variant={emailConnected ? "secondary" : "primary"}>
                  {!emailConnected ? "Get login link" : customer.user ? "Resend login email" : "Send login email"}
                </SubmitButton>
              </ActionForm>
            )}
          </Card>
          <Chatter entityType="customer" entityId={customer.id} path={`/app/customers/${customer.id}`} />
        </div>
      </div>
    </>
  );
}
