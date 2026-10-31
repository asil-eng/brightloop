import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { DiscountForm } from "../discount-form";
import { createDiscount } from "../actions";

export const metadata = { title: "New discount" };

export default async function NewDiscountPage() {
  await requireAdmin();
  const products = await db.product.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="New discount" breadcrumbs={[{ label: "Discounts", href: "/app/discounts" }, { label: "New" }]} />
      <Card className="max-w-3xl"><DiscountForm action={createDiscount} products={products} /></Card>
    </>
  );
}
