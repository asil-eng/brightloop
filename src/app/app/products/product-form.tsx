import type { Product, Tax } from "@prisma/client";
import { ActionForm, SubmitButton, type FormAction } from "@/components/form";
import { Field } from "@/components/ui";
import { toMajor } from "@/lib/money";

export function ProductForm({ action, product, taxes, readOnly }: { action: FormAction; product?: Product & { taxes: Tax[] }; taxes: Tax[]; readOnly?: boolean }) {
  const selected = new Set(product ? product.taxes.map((t) => t.id) : taxes.filter((t) => t.name.includes("18")).map((t) => t.id));
  return (
    <ActionForm action={action}>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        {product && <input type="hidden" name="id" value={product.id} />}
        <Field label="Product name" className="sm:col-span-2">
          <input name="name" required defaultValue={product?.name} className="input" />
        </Field>
        <Field label="Type">
          <select name="type" defaultValue={product?.type ?? "SERVICE"} className="input">
            <option value="SERVICE">Service</option>
            <option value="ADDON">Add-on</option>
            <option value="GOODS">Goods</option>
          </select>
        </Field>
        <Field label="Taxes">
          <div className="flex flex-wrap gap-3 pt-2">
            {taxes.map((t) => (
              <label key={t.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="taxIds" value={t.id} defaultChecked={selected.has(t.id)} /> {t.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Sales price (₹)">
          <input name="salesPrice" type="number" step="0.01" min="0" required defaultValue={product ? toMajor(product.salesPrice) : ""} className="input" />
        </Field>
        <Field label="Cost price (₹)">
          <input name="costPrice" type="number" step="0.01" min="0" defaultValue={product ? toMajor(product.costPrice) : "0"} className="input" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea name="notes" rows={3} defaultValue={product?.notes} className="input" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="recurring" defaultChecked={product?.recurring ?? true} /> Can be sold on subscription
        </label>
        {product && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={product.active} /> Active
          </label>
        )}
        {!readOnly && (
          <div className="sm:col-span-2">
            <SubmitButton>{product ? "Save product" : "Create product"}</SubmitButton>
          </div>
        )}
      </fieldset>
    </ActionForm>
  );
}
