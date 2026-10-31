import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Card, PageHeader } from "@/components/ui";
import { Checkout } from "./checkout";

export const metadata = { title: "Pay invoice" };

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { customer } = await requireCustomer();
  const { id } = await params;
  const inv = await db.invoice.findFirst({ where: { id, customerId: customer.id } });
  if (!inv || inv.status === "DRAFT") notFound();
  if (inv.status !== "CONFIRMED") redirect(`/portal/invoices/${id}`);
  const due = inv.total - inv.amountPaid;
  return (
    <>
      <PageHeader title="Pay invoice" breadcrumbs={[{ label: "Invoices", href: "/portal/invoices" }, { label: inv.number ?? "", href: `/portal/invoices/${id}` }, { label: "Pay" }]} />
      <div className="mx-auto grid max-w-3xl gap-5 md:grid-cols-5">
        <Card className="md:col-span-2">
          <p className="label">Invoice</p>
          <p className="font-medium">{inv.number}</p>
          <p className="mt-3 label">Due date</p>
          <p>{formatDate(inv.dueDate)}</p>
          <p className="mt-3 label">Amount to pay</p>
          <p className="text-2xl font-semibold">{formatMoney(due)}</p>
          <p className="mt-4 text-xs text-zinc-500">The money goes straight to Brightloop Software. Your card details are never stored.</p>
        </Card>
        <Card className="md:col-span-3" title="Payment details">
          <Checkout invoiceId={id} amount={formatMoney(due)} />
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Demo payment provider: no real money moves. Use any card such as 4242 4242 4242 4242 with a future expiry. Card 4000 0000 0000 0002 is declined.
          </p>
        </Card>
      </div>
    </>
  );
}
