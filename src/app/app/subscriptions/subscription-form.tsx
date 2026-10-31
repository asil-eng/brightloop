import type { CloseReason, Customer, PaymentTerm, RecurringPlan } from "@prisma/client";
import { ActionForm, SubmitButton, type FormAction } from "@/components/form";
import { Field } from "@/components/ui";
import { LineEditor, type CatalogProduct, type CatalogTax, type EditorLine } from "@/components/line-editor";
import { periodLabel, toInputDate } from "@/lib/dates";

export type SubscriptionFormValues = {
  id?: string;
  customerId?: string;
  planId?: string;
  startDate?: Date;
  expiryDate?: Date | null;
  quoteValidUntil?: Date | null;
  paymentTermId?: string | null;
  templateId?: string | null;
  note?: string;
  lines: EditorLine[];
};

export function SubscriptionForm({
  action,
  values,
  customers,
  plans,
  terms,
  products,
  taxes,
  headerLocked = false,
  minQuantity = 1,
}: {
  action: FormAction;
  values: SubscriptionFormValues;
  customers: Pick<Customer, "id" | "name" | "company">[];
  plans: RecurringPlan[];
  terms: PaymentTerm[];
  products: CatalogProduct[];
  taxes: CatalogTax[];
  reasons?: CloseReason[];
  headerLocked?: boolean;
  minQuantity?: number;
}) {
  return (
    <ActionForm action={action} className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {values.templateId && <input type="hidden" name="templateId" value={values.templateId} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Customer">
          <select name="customerId" required defaultValue={values.customerId ?? ""} disabled={headerLocked} className="input">
            <option value="" disabled>Choose a customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</option>
            ))}
          </select>
        </Field>
        <Field label="Recurring plan" hint={headerLocked ? undefined : "Plan price is added as a line when the subscription is created."}>
          <select name="planId" required defaultValue={values.planId ?? ""} disabled={headerLocked} className="input">
            <option value="" disabled>Choose a plan…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({periodLabel(p.period, p.interval)}{p.minQuantity > 1 ? `, min ${p.minQuantity}` : ""})</option>
            ))}
          </select>
        </Field>
        <Field label="Payment terms">
          <select name="paymentTermId" defaultValue={values.paymentTermId ?? ""} className="input">
            <option value="">Immediate</option>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Start date">
          <input name="startDate" type="date" required disabled={headerLocked} defaultValue={toInputDate(values.startDate)} className="input" />
        </Field>
        <Field label="Expiry date" hint="Leave empty for an open-ended subscription.">
          <input name="expiryDate" type="date" defaultValue={toInputDate(values.expiryDate)} className="input" />
        </Field>
        <Field label="Quotation valid until">
          <input name="quoteValidUntil" type="date" disabled={headerLocked} defaultValue={toInputDate(values.quoteValidUntil)} className="input" />
        </Field>
        <Field label="Internal note" className="sm:col-span-2 lg:col-span-3">
          <input name="note" defaultValue={values.note} className="input" />
        </Field>
      </div>
      <div>
        <p className="label">Order lines</p>
        <LineEditor products={products} taxes={taxes} initial={values.lines} minQuantity={minQuantity} />
      </div>
      <SubmitButton>{values.id ? "Save" : "Create quotation"}</SubmitButton>
    </ActionForm>
  );
}
