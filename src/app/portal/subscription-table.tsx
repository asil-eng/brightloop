import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Badge } from "@/components/ui";

export function SubscriptionTable({ subs }: { subs: { id: string; number: string; status: string; total: number; nextInvoiceDate: Date | null; startDate: Date; plan: { name: string } }[] }) {
  if (!subs.length) return <p className="text-sm text-zinc-500">You don&apos;t have any subscriptions yet.</p>;
  return (
    <table className="table">
      <thead><tr><th>Subscription</th><th>Plan</th><th>Started</th><th>Next invoice</th><th className="text-right">Amount per period</th><th>Status</th></tr></thead>
      <tbody>
        {subs.map((s) => (
          <tr key={s.id}>
            <td><Link className="link" href={`/portal/subscriptions/${s.id}`}>{s.number}</Link></td>
            <td>{s.plan.name}</td>
            <td>{formatDate(s.startDate)}</td>
            <td>{s.status === "ACTIVE" ? formatDate(s.nextInvoiceDate) : "—"}</td>
            <td className="text-right tabular-nums">{formatMoney(s.total)}</td>
            <td><Badge status={s.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
