import type { PaymentTerm, QuotationTemplate, RecurringPlan, TemplateLine } from "@prisma/client";
import { ActionForm, SubmitButton, type FormAction } from "@/components/form";
import { Field } from "@/components/ui";
import { LineEditor, type CatalogProduct, type CatalogTax } from "@/components/line-editor";

export function TemplateForm({
  action,
  template,
  plans,
  terms,
  products,
  taxes,
}: {
  action: FormAction;
  template?: QuotationTemplate & { lines: TemplateLine[] };
  plans: RecurringPlan[];
  terms: PaymentTerm[];
  products: CatalogProduct[];
  taxes: CatalogTax[];
}) {
  const initial =
    template?.lines.map((l) => {
      const p = products.find((x) => x.id === l.productId);
      const v = p?.variants.find((x) => x.id === l.variantId);
      return { productId: l.productId, variantId: l.variantId, description: p ? (v ? `${p.name} (${v.name})` : p.name) : "", quantity: l.quantity, unitPrice: (p?.price ?? 0) + (v?.extra ?? 0), taxIds: p?.taxIds ?? [] };
    }) ?? [];
  return (
    <ActionForm action={action} className="space-y-5">
      {template && <input type="hidden" name="id" value={template.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Template name" className="sm:col-span-2"><input name="name" required defaultValue={template?.name} className="input" /></Field>
        <Field label="Recurring plan">
          <select name="planId" required defaultValue={template?.planId} className="input">
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Quotation valid for (days)">
          <input name="validityDays" type="number" min="1" defaultValue={template?.validityDays ?? 30} className="input" />
        </Field>
        <Field label="Payment terms">
          <select name="paymentTermId" defaultValue={template?.paymentTermId ?? ""} className="input">
            <option value="">—</option>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Note"><input name="note" defaultValue={template?.note} className="input" /></Field>
      </div>
      <div>
        <p className="label">Product lines</p>
        <LineEditor products={products} taxes={taxes} initial={initial} pricing={false} />
      </div>
      <SubmitButton>{template ? "Save template" : "Create template"}</SubmitButton>
    </ActionForm>
  );
}
