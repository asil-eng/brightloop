import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate, startOfDay } from "@/lib/dates";
import { discountIsValid } from "@/lib/pricing";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Discounts" };

export default async function DiscountsPage() {
  const { db } = await requireAdmin();
  const discounts = await db.discount.findMany({
    include: { products: { select: { name: true } }, _count: { select: { subscriptions: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
  const today = startOfDay();
  return (
    <>
      <PageHeader
        title="Discounts"
        subtitle="Only administrators can create discount rules. They apply to the next invoice automatically."
        actions={<LinkButton href="/app/discounts/new" variant="primary">New discount</LinkButton>}
      />
      <div className="card overflow-x-auto">
        {discounts.length === 0 ? <EmptyState title="No discounts yet" /> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Discount</th><th>Applies to</th><th>Conditions</th><th>Valid</th><th className="text-right">Used</th><th>Status</th></tr></thead>
            <tbody>
              {discounts.map((d) => {
                const valid = discountIsValid({ ...d, productIds: [], subscriptionIds: [] }, today);
                return (
                  <tr key={d.id}>
                    <td><Link className="link" href={`/app/discounts/${d.id}`}>{d.name}</Link></td>
                    <td>{d.type === "PERCENT" ? `${d.value}%` : formatMoney(d.value)}</td>
                    <td className="text-zinc-600">{d.scope === "PRODUCTS" ? d.products.map((p) => p.name).join(", ") : d._count.subscriptions ? `${d._count.subscriptions} subscription(s)` : "All subscriptions"}</td>
                    <td className="text-zinc-600">{[d.minQuantity && `qty ≥ ${d.minQuantity}`, d.minPurchase && `≥ ${formatMoney(d.minPurchase)}`].filter(Boolean).join(", ") || "—"}</td>
                    <td className="whitespace-nowrap text-zinc-600">{formatDate(d.startDate)} → {formatDate(d.endDate)}</td>
                    <td className="text-right">{d.usedCount}{d.usageLimit ? ` / ${d.usageLimit}` : ""}</td>
                    <td>{valid ? <Badge status="ACTIVE" label="Running" /> : <Badge status="CLOSED" label={d.active ? "Not running" : "Ended"} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
