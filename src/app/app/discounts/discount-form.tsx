import type { Discount, Product, Subscription } from "@prisma/client";
import { ActionForm, SubmitButton, type FormAction } from "@/components/form";
import { Field } from "@/components/ui";
import { toMajor } from "@/lib/money";
import { toInputDate } from "@/lib/dates";

export function DiscountForm({
  action,
  discount,
  products,
}: {
  action: FormAction;
  discount?: Discount & { products: Product[]; subscriptions: Pick<Subscription, "number">[] };
  products: Pick<Product, "id" | "name">[];
}) {
  const selected = new Set(discount?.products.map((p) => p.id));
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      {discount && <input type="hidden" name="id" value={discount.id} />}
      <Field label="Name" className="sm:col-span-2"><input name="name" required defaultValue={discount?.name} className="input" placeholder="e.g. 10% off 10+ seats" /></Field>
      <Field label="Type">
        <select name="type" defaultValue={discount?.type ?? "PERCENT"} className="input">
          <option value="PERCENT">Percentage (%)</option>
          <option value="FIXED">Fixed amount (₹)</option>
        </select>
      </Field>
      <Field label="Value" hint="Percent for percentage discounts, rupees for fixed ones.">
        <input name="value" type="number" step="0.01" min="0.01" required defaultValue={discount ? (discount.type === "FIXED" ? toMajor(discount.value) : discount.value) : ""} className="input" />
      </Field>
      <Field label="Minimum purchase (₹)" hint="Invoice amount before discount. Optional.">
        <input name="minPurchase" type="number" step="0.01" min="0" defaultValue={discount?.minPurchase != null ? toMajor(discount.minPurchase) : ""} className="input" />
      </Field>
      <Field label="Minimum quantity" hint="Total quantity of the matching lines. Optional.">
        <input name="minQuantity" type="number" min="1" defaultValue={discount?.minQuantity ?? ""} className="input" />
      </Field>
      <Field label="Start date"><input name="startDate" type="date" defaultValue={toInputDate(discount?.startDate)} className="input" /></Field>
      <Field label="End date"><input name="endDate" type="date" defaultValue={toInputDate(discount?.endDate)} className="input" /></Field>
      <Field label="Usage limit" hint={discount ? `Used ${discount.usedCount} time(s) so far. Each invoice counts as one use.` : "Each invoice it applies to counts as one use. Optional."}>
        <input name="usageLimit" type="number" min="1" defaultValue={discount?.usageLimit ?? ""} className="input" />
      </Field>
      <div />
      <fieldset className="space-y-3 sm:col-span-2">
        <legend className="label">Applies to</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="scope" value="PRODUCTS" defaultChecked={(discount?.scope ?? "PRODUCTS") === "PRODUCTS"} className="mt-1" />
          <span>
            <span className="font-medium">Specific products</span> — discounts those product lines on any subscription
            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5">
                  <input type="checkbox" name="productIds" value={p.id} defaultChecked={selected.has(p.id)} /> {p.name}
                </label>
              ))}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="scope" value="SUBSCRIPTION" defaultChecked={discount?.scope === "SUBSCRIPTION"} className="mt-1" />
          <span className="flex-1">
            <span className="font-medium">Whole subscriptions</span> — discounts the full invoice total
            <input name="subscriptions" defaultValue={discount?.subscriptions.map((s) => s.number).join(", ")} placeholder="Subscription numbers, e.g. SUB/00012, SUB/00040 — leave empty for all" className="input mt-2" />
          </span>
        </label>
      </fieldset>
      {discount && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={discount.active} /> Active</label>
      )}
      <div className="sm:col-span-2"><SubmitButton>{discount ? "Save discount" : "Create discount"}</SubmitButton></div>
    </ActionForm>
  );
}
