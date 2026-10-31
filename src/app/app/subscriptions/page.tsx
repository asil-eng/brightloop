import Link from "next/link";
import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { requireBackoffice } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate, parseInputDate, periodLabel } from "@/lib/dates";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { PAGE_SIZE, Pagination, QueryTabs, SearchBar, pageOf, param, type SearchParams } from "@/components/list";

export const metadata = { title: "Subscriptions" };

const STATUSES: SubscriptionStatus[] = ["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "PAUSED", "CLOSED"];

export default async function SubscriptionsPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireBackoffice();
  const sp = await searchParams;
  const view = param(sp, "view") || "list";
  const page = pageOf(sp);
  const q = param(sp, "q");
  const status = param(sp, "status") as SubscriptionStatus | "";
  const planId = param(sp, "planId");
  const customerId = param(sp, "customerId");
  const from = parseInputDate(param(sp, "from"));
  const to = parseInputDate(param(sp, "to"));

  const where: Prisma.SubscriptionWhereInput = {
    ...(q && { OR: [{ number: { contains: q } }, { customer: { name: { contains: q } } }, { customer: { company: { contains: q } } }] }),
    ...(status && STATUSES.includes(status) && { status }),
    ...(planId && { planId }),
    ...(customerId && { customerId }),
    ...((from || to) && { startDate: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
  };
  const plans = await db.recurringPlan.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader
        title="Subscriptions"
        actions={
          <>
            <QueryTabs base="/app/subscriptions" sp={sp} name="view" tabs={[{ value: "list", label: "List" }, { value: "kanban", label: "Kanban" }]} />
            <LinkButton href="/app/subscriptions/new" variant="primary">New quotation</LinkButton>
          </>
        }
      />
      <SearchBar
        action="/app/subscriptions"
        sp={sp}
        placeholder="Search number, customer or company…"
        dateRange
        filters={[
          { name: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
          { name: "planId", label: "Plan", options: plans.map((p) => ({ value: p.id, label: p.name })) },
        ]}
        extra={
          <>
            {view !== "list" && <input type="hidden" name="view" value={view} />}
            {customerId && <input type="hidden" name="customerId" value={customerId} />}
          </>
        }
      />
      {view === "kanban" ? <Kanban where={where} /> : <List where={where} sp={sp} page={page} />}
    </>
  );
}

async function List({ where, sp, page }: { where: Prisma.SubscriptionWhereInput; sp: Record<string, string | string[] | undefined>; page: number }) {
  const { db } = await requireBackoffice();
  const [subs, total] = await Promise.all([
    db.subscription.findMany({
      where,
      include: { customer: { select: { name: true, company: true } }, plan: { select: { name: true, period: true, interval: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.subscription.count({ where }),
  ]);
  return (
    <div className="card overflow-x-auto">
      {subs.length === 0 ? (
        <EmptyState title="No subscriptions found">Try a different search or filter.</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th>Plan</th>
              <th>Start</th>
              <th>Expiry</th>
              <th>Next invoice</th>
              <th className="text-right">Recurring total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/app/subscriptions/${s.id}`} className="link">{s.number}</Link></td>
                <td>
                  <div>{s.customer.name}</div>
                  {s.customer.company && <div className="text-xs text-ink-secondary">{s.customer.company}</div>}
                </td>
                <td>
                  {s.plan.name}
                  <div className="text-xs text-ink-secondary">{periodLabel(s.plan.period, s.plan.interval)}</div>
                </td>
                <td className="whitespace-nowrap">{formatDate(s.startDate)}</td>
                <td className="whitespace-nowrap">{formatDate(s.expiryDate)}</td>
                <td className="whitespace-nowrap">{s.status === "ACTIVE" ? formatDate(s.nextInvoiceDate) : "—"}</td>
                <td className="text-right tabular-nums">{formatMoney(s.total)}</td>
                <td><Badge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination base="/app/subscriptions" sp={sp} page={page} total={total} />
    </div>
  );
}

const KANBAN_LIMIT = 15;

async function Kanban({ where }: { where: Prisma.SubscriptionWhereInput }) {
  const { db } = await requireBackoffice();
  const columns = await Promise.all(
    STATUSES.map(async (status) => {
      // A status filter hides the other columns' cards.
      if (where.status && where.status !== status) return { status, items: [], count: 0, sum: 0 };
      const w = { ...where, status };
      const [items, count, sum] = await Promise.all([
        db.subscription.findMany({ where: w, include: { customer: { select: { name: true } }, plan: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: KANBAN_LIMIT }),
        db.subscription.count({ where: w }),
        db.subscription.aggregate({ where: w, _sum: { total: true } }),
      ]);
      return { status, items, count, sum: sum._sum.total ?? 0 };
    }),
  );
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((c) => (
        <div key={c.status} className="w-72 shrink-0 rounded-panel border border-rule/70 bg-ground p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <Badge status={c.status} />
            <span className="text-xs text-ink-secondary">{c.count.toLocaleString("en-IN")} · {formatMoney(c.sum)}</span>
          </div>
          <div className="space-y-2">
            {c.items.map((s) => (
              <Link key={s.id} href={`/app/subscriptions/${s.id}`} className="block rounded-lg border border-rule bg-panel p-3 text-sm shadow-sm hover:border-brand-200">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{s.customer.name}</span>
                  <span className="text-xs text-ink-secondary/70">{s.number}</span>
                </div>
                <div className="mt-1 flex justify-between text-xs text-ink-secondary">
                  <span>{s.plan.name}</span>
                  <span className="font-medium text-ink-secondary">{formatMoney(s.total)}</span>
                </div>
              </Link>
            ))}
            {c.count > KANBAN_LIMIT && (
              <Link href={`/app/subscriptions?status=${c.status}`} className="block px-1 text-xs text-brand-600 hover:underline">
                + {(c.count - KANBAN_LIMIT).toLocaleString("en-IN")} more
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
