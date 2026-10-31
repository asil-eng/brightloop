import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { DiscountForm } from "../discount-form";
import { updateDiscount } from "../actions";

export default async function DiscountPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireAdmin();
  const { id } = await params;
  const [discount, products] = await Promise.all([
    db.discount.findUnique({ where: { id }, include: { products: true, subscriptions: { select: { number: true } } } }),
    db.product.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!discount) notFound();
  return (
    <>
      <PageHeader title={discount.name} breadcrumbs={[{ label: "Discounts", href: "/app/discounts" }, { label: discount.name }]} />
      <Card className="max-w-3xl"><DiscountForm action={updateDiscount} discount={discount} products={products} /></Card>
    </>
  );
}
