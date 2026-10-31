import Link from "next/link";
import { requireBackoffice } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate, periodLabel } from "@/lib/dates";
import { Badge, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Recurring plans" };

const yes = (b: boolean) => (b ? "✓" : "—");

export default async function PlansPage() {
  const user = await requireBackoffice();
  const { db } = user;
  const plans = await db.recurringPlan.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { subscriptions: { where: { status: "ACTIVE" } } } } },
  });
  return (
    <>
      <PageHeader
        title="Recurring plans"
        subtitle="How often subscriptions bill and what customers may do with them."
        actions={user.role === "ADMIN" && <LinkButton href="/app/plans/new" variant="primary">New plan</LinkButton>}
      />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Billing</th>
              <th className="text-right">Price</th>
              <th className="text-right">Min qty</th>
              <th>Available</th>
              <th className="text-center">Auto-close</th>
              <th className="text-center">Closable</th>
              <th className="text-center">Pausable</th>
              <th className="text-center">Renewable</th>
              <th className="text-right">Active subs</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/app/plans/${p.id}`} className="link">{p.name}</Link></td>
                <td>{periodLabel(p.period, p.interval)}</td>
                <td className="text-right tabular-nums">{formatMoney(p.price)}</td>
                <td className="text-right">{p.minQuantity}</td>
                <td className="whitespace-nowrap text-zinc-500">{p.startDate || p.endDate ? `${formatDate(p.startDate)} → ${p.endDate ? formatDate(p.endDate) : "open"}` : "Always"}</td>
                <td className="text-center">{yes(p.autoClose)}</td>
                <td className="text-center">{yes(p.closable)}</td>
                <td className="text-center">{yes(p.pausable)}</td>
                <td className="text-center">{yes(p.renewable)}</td>
                <td className="text-right">{p._count.subscriptions.toLocaleString("en-IN")}</td>
                <td>{!p.active && <Badge status="CLOSED" label="Archived" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
