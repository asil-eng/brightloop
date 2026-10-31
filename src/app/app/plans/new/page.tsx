import { requireAdmin } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { PlanForm } from "../plan-form";
import { createPlan } from "../actions";

export const metadata = { title: "New plan" };

export default async function NewPlanPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="New recurring plan" breadcrumbs={[{ label: "Recurring plans", href: "/app/plans" }, { label: "New" }]} />
      <Card className="max-w-3xl">
        <PlanForm action={createPlan} />
      </Card>
    </>
  );
}
