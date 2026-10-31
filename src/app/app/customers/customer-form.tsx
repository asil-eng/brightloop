import type { Customer } from "@prisma/client";
import { ActionForm, SubmitButton, type FormAction } from "@/components/form";
import { Field } from "@/components/ui";

export function CustomerForm({ action, customer }: { action: FormAction; customer?: Customer }) {
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <Field label="Name"><input name="name" required defaultValue={customer?.name} className="input" /></Field>
      <Field label="Company"><input name="company" defaultValue={customer?.company} className="input" /></Field>
      <Field label="Email"><input name="email" type="email" required defaultValue={customer?.email} className="input" /></Field>
      <Field label="Phone"><input name="phone" defaultValue={customer?.phone} className="input" /></Field>
      <Field label="Billing address" className="sm:col-span-2"><textarea name="address" rows={3} defaultValue={customer?.address} className="input" /></Field>
      <Field label="Tax ID (GSTIN)"><input name="taxId" defaultValue={customer?.taxId} className="input" /></Field>
      <div className="sm:col-span-2"><SubmitButton>{customer ? "Save customer" : "Create customer"}</SubmitButton></div>
    </ActionForm>
  );
}
