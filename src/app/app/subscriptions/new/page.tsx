import { requireBackoffice } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { addDays, startOfDay } from "@/lib/dates";
import { Card, PageHeader } from "@/components/ui";
import type { EditorLine } from "@/components/line-editor";
import { SubscriptionForm, type SubscriptionFormValues } from "../subscription-form";
import { createSubscription } from "../actions";
import Link from "next/link";

export const metadata = { title: "New subscription" };

export default async function NewSubscriptionPage({ searchParams }: { searchParams: Promise<{ templateId?: string; customerId?: string }> }) {
  const { db } = await requireBackoffice();
  const { templateId, customerId } = await searchParams;
  const today = startOfDay();
  const [{ products, taxes }, customers, plans, terms, templates] = await Promise.all([
    loadCatalog(db),
    db.customer.findMany({ select: { id: true, name: true, company: true }, orderBy: { name: "asc" } }),
    db.recurringPlan.findMany({
      where: { active: true, OR: [{ endDate: null }, { endDate: { gte: today } }] },
      orderBy: { name: "asc" },
    }),
    db.paymentTerm.findMany({ orderBy: { dueDays: "asc" } }),
    db.quotationTemplate.findMany({ orderBy: { name: "asc" } }),
  ]);

  const values: SubscriptionFormValues = { customerId, startDate: today, quoteValidUntil: addDays(today, 30), lines: [] };
  let minQuantity = 1;
  if (templateId) {
    const t = await db.quotationTemplate.findUnique({ where: { id: templateId }, include: { lines: true, plan: true } });
    if (t) {
      minQuantity = t.plan.minQuantity;
      values.templateId = t.id;
      values.planId = t.planId;
      values.paymentTermId = t.paymentTermId;
      values.quoteValidUntil = addDays(today, t.validityDays);
      values.note = t.note;
      values.lines = t.lines.map((l): EditorLine => {
        const p = products.find((x) => x.id === l.productId);
        const v = p?.variants.find((x) => x.id === l.variantId);
        return {
          productId: l.productId,
          variantId: l.variantId,
          description: p ? (v ? `${p.name} (${v.name})` : p.name) : "",
          quantity: l.quantity,
          unitPrice: (p?.price ?? 0) + (v?.extra ?? 0),
          taxIds: p?.taxIds ?? [],
        };
      });
    }
  }

  return (
    <>
      <PageHeader title="New quotation" breadcrumbs={[{ label: "Subscriptions", href: "/app/subscriptions" }, { label: "New" }]} />
      {templates.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Start from a template:</span>
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/app/subscriptions/new?templateId=${t.id}${customerId ? `&customerId=${customerId}` : ""}`}
              className={`rounded-full border px-3 py-1 ${t.id === templateId ? "border-brand-600 bg-brand-600 text-white" : "border-zinc-300 bg-white hover:border-brand-200"}`}
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}
      <Card>
        <SubscriptionForm
          key={templateId ?? "blank"}
          action={createSubscription}
          values={values}
          customers={customers}
          plans={plans}
          terms={terms}
          products={products}
          taxes={taxes}
          minQuantity={minQuantity}
        />
      </Card>
    </>
  );
}
