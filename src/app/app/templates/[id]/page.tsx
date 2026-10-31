import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireBackoffice } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { TemplateForm } from "../template-form";
import { updateTemplate } from "../actions";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireBackoffice();
  const { id } = await params;
  const template = await db.quotationTemplate.findUnique({ where: { id }, include: { lines: true } });
  if (!template) notFound();
  const [{ products, taxes }, plans, terms] = await Promise.all([
    loadCatalog(),
    db.recurringPlan.findMany({ orderBy: { name: "asc" } }),
    db.paymentTerm.findMany({ orderBy: { dueDays: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        title={template.name}
        breadcrumbs={[{ label: "Quotation templates", href: "/app/templates" }, { label: template.name }]}
        actions={<LinkButton href={`/app/subscriptions/new?templateId=${template.id}`} variant="primary">Create quotation from template</LinkButton>}
      />
      <Card><TemplateForm action={updateTemplate} template={template} plans={plans} terms={terms} products={products} taxes={taxes} /></Card>
    </>
  );
}
