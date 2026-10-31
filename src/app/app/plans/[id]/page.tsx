import { notFound } from "next/navigation";
import { requireBackoffice } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { PlanForm } from "../plan-form";
import { updatePlan } from "../actions";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireBackoffice();
  const { db } = user;
  const { id } = await params;
  const plan = await db.recurringPlan.findUnique({ where: { id } });
  if (!plan) notFound();
  return (
    <>
      <PageHeader title={plan.name} breadcrumbs={[{ label: "Recurring plans", href: "/app/plans" }, { label: plan.name }]} />
      <Card className="max-w-3xl">
        <PlanForm action={updatePlan} plan={plan} readOnly={user.role !== "ADMIN"} />
      </Card>
    </>
  );
}
