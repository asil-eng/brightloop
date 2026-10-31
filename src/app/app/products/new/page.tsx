import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";
import { createProduct } from "../actions";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin();
  const taxes = await db.tax.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="New product" breadcrumbs={[{ label: "Products", href: "/app/products" }, { label: "New" }]} />
      <Card className="max-w-3xl">
        <ProductForm action={createProduct} taxes={taxes} />
        <p className="mt-4 text-xs text-zinc-500">You can add variants (e.g. Brand) after creating the product.</p>
      </Card>
    </>
  );
}
