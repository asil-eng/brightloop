import { db } from "@/lib/db";
import { requireCustomer } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { SubscriptionTable } from "../subscription-table";

export const metadata = { title: "My subscriptions" };

export default async function PortalSubscriptions() {
  const { customer } = await requireCustomer();
  const subs = await db.subscription.findMany({ where: { customerId: customer.id, status: { not: "DRAFT" } }, include: { plan: true }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="My subscriptions" />
      <Card><SubscriptionTable subs={subs} /></Card>
    </>
  );
}
