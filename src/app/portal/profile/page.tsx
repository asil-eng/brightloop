import { requireCustomer } from "@/lib/auth";
import { Card, Field, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { PasswordWithRules } from "../../(auth)/password-input";
import { changePassword, updateProfile } from "../actions";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const user = await requireCustomer();
  const c = user.customer;
  return (
    <>
      <PageHeader title="My profile" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Details">
          <ActionForm action={updateProfile} className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input name="name" defaultValue={c.name} required className="input" /></Field>
            <Field label="Email" hint="Contact us to change your login email."><input value={c.email} disabled className="input" /></Field>
            <Field label="Company"><input name="company" defaultValue={c.company} className="input" /></Field>
            <Field label="Phone"><input name="phone" defaultValue={c.phone} className="input" /></Field>
            <Field label="Billing address" className="sm:col-span-2"><textarea name="address" rows={3} defaultValue={c.address} className="input" /></Field>
            <Field label="Tax ID (GSTIN)"><input name="taxId" defaultValue={c.taxId} className="input" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Save</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card title="Change password">
          <ActionForm action={changePassword} className="space-y-4">
            <Field label="Current password"><input name="current" type="password" required className="input" autoComplete="current-password" /></Field>
            <PasswordWithRules label="New password" />
            <Field label="Confirm new password"><input name="confirm" type="password" required className="input" autoComplete="new-password" /></Field>
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
