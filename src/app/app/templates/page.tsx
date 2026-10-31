import Link from "next/link";
import { requireBackoffice } from "@/lib/auth";
import { LinkButton, PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Quotation templates" };

export default async function TemplatesPage() {
  const { db } = await requireBackoffice();
  const templates = await db.quotationTemplate.findMany({
    include: { plan: true, paymentTerm: true, _count: { select: { lines: true, subscriptions: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader
        title="Quotation templates"
        subtitle="Ready-made offers: start a quotation with the right plan and products in one click."
        actions={<LinkButton href="/app/templates/new" variant="primary">New template</LinkButton>}
      />
      <div className="card overflow-x-auto">
        {templates.length === 0 ? <EmptyState title="No templates yet" /> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Plan</th><th>Valid for</th><th>Payment terms</th><th className="text-right">Lines</th><th className="text-right">Times used</th><th /></tr></thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/app/templates/${t.id}`} className="link">{t.name}</Link></td>
                  <td>{t.plan.name}</td>
                  <td>{t.validityDays} days</td>
                  <td>{t.paymentTerm?.name ?? "—"}</td>
                  <td className="text-right">{t._count.lines}</td>
                  <td className="text-right">{t._count.subscriptions}</td>
                  <td className="text-right"><LinkButton size="sm" href={`/app/subscriptions/new?templateId=${t.id}`}>Use</LinkButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
