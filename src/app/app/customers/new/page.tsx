import { requireBackoffice } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { CustomerForm } from "../customer-form";
import { createCustomer } from "../actions";

export const metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requireBackoffice();
  return (
    <>
      <PageHeader title="New customer" breadcrumbs={[{ label: "Customers", href: "/app/customers" }, { label: "New" }]} />
      <Card className="max-w-3xl"><CustomerForm action={createCustomer} /></Card>
    </>
  );
}
