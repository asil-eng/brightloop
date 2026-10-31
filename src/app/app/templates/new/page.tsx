import { requireBackoffice } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { Card, PageHeader } from "@/components/ui";
import { TemplateForm } from "../template-form";
import { createTemplate } from "../actions";

export const metadata = { title: "New template" };

export default async function NewTemplatePage() {
  const { db } = await requireBackoffice();
  const [{ products, taxes }, plans, terms] = await Promise.all([
    loadCatalog(db),
    db.recurringPlan.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.paymentTerm.findMany({ orderBy: { dueDays: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="New quotation template" breadcrumbs={[{ label: "Quotation templates", href: "/app/templates" }, { label: "New" }]} />
      <Card><TemplateForm action={createTemplate} plans={plans} terms={terms} products={products} taxes={taxes} /></Card>
    </>
  );
}
