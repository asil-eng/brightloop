import Link from "next/link";
import { ci } from "@/lib/search";
import type { Prisma } from "@prisma/client";
import { requireBackoffice } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { PAGE_SIZE, Pagination, SearchBar, pageOf, param, type SearchParams } from "@/components/list";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireBackoffice();
  const sp = await searchParams;
  const page = pageOf(sp);
  const q = param(sp, "q");
  const where: Prisma.CustomerWhereInput = q
    ? { OR: [{ name: ci(q) }, { email: ci(q) }, { company: ci(q) }] }
    : {};
  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { subscriptions: { where: { status: "ACTIVE" } } } } },
    }),
    db.customer.count({ where }),
  ]);
  // Outstanding balance per customer on this page, computed in the database.
  const balances = await db.invoice.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customers.map((c) => c.id) }, status: "CONFIRMED" },
    _sum: { total: true, amountPaid: true },
  });
  const due = new Map(balances.map((b) => [b.customerId, (b._sum.total ?? 0) - (b._sum.amountPaid ?? 0)]));

  return (
    <>
      <PageHeader title="Customers" actions={<LinkButton href="/app/customers/new" variant="primary">New customer</LinkButton>} />
      <SearchBar action="/app/customers" sp={sp} placeholder="Search name, email or company…" />
      <div className="card overflow-x-auto">
        {customers.length === 0 ? (
          <EmptyState title="No customers found" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Portal</th>
                <th className="text-right">Active subscriptions</th>
                <th className="text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/app/customers/${c.id}`} className="link">{c.name}</Link></td>
                  <td>{c.company || "—"}</td>
                  <td className="text-ink-secondary">{c.email}</td>
                  <td>{c.userId ? "✓" : "—"}</td>
                  <td className="text-right">{c._count.subscriptions}</td>
                  <td className={`text-right tabular-nums ${due.get(c.id) ? "text-red-600" : "text-ink-secondary/70"}`}>{formatMoney(due.get(c.id) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination base="/app/customers" sp={sp} page={page} total={total} />
      </div>
    </>
  );
}
