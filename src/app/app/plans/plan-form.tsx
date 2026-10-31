import type { RecurringPlan } from "@prisma/client";
import { ActionForm, SubmitButton, type FormAction } from "@/components/form";
import { Field } from "@/components/ui";
import { toMajor } from "@/lib/money";
import { toInputDate } from "@/lib/dates";

const options: { name: keyof RecurringPlan; label: string; hint: string; default: boolean }[] = [
  { name: "autoClose", label: "Closes automatically", hint: "Subscriptions close on their own at the end of their term.", default: false },
  { name: "closable", label: "Can be closed early", hint: "Customers and staff can close before the end date.", default: true },
  { name: "pausable", label: "Can be paused", hint: "Billing stops while paused and resumes later.", default: true },
  { name: "renewable", label: "Can be renewed", hint: "Extend for another term (automatic if it doesn't auto-close).", default: true },
];

export function PlanForm({ action, plan, readOnly }: { action: FormAction; plan?: RecurringPlan; readOnly?: boolean }) {
  return (
    <ActionForm action={action}>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        {plan && <input type="hidden" name="id" value={plan.id} />}
        <Field label="Plan name" className="sm:col-span-2">
          <input name="name" required defaultValue={plan?.name} className="input" />
        </Field>
        <Field label="Price per period (₹)" hint="Added to every subscription on this plan as a plan fee line. Use 0 for none.">
          <input name="price" type="number" step="0.01" min="0" defaultValue={plan ? toMajor(plan.price) : "0"} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Bills every">
            <input name="interval" type="number" min="1" defaultValue={plan?.interval ?? 1} className="input" />
          </Field>
          <Field label="Period">
            <select name="period" defaultValue={plan?.period ?? "MONTHLY"} className="input">
              <option value="DAILY">Day(s)</option>
              <option value="WEEKLY">Week(s)</option>
              <option value="MONTHLY">Month(s)</option>
              <option value="YEARLY">Year(s)</option>
            </select>
          </Field>
        </div>
        <Field label="Minimum quantity" hint="Each product line must have at least this quantity.">
          <input name="minQuantity" type="number" min="1" defaultValue={plan?.minQuantity ?? 1} className="input" />
        </Field>
        <div />
        <Field label="Available from">
          <input name="startDate" type="date" defaultValue={toInputDate(plan?.startDate)} className="input" />
        </Field>
        <Field label="Available until" hint="Leave empty to keep the plan available.">
          <input name="endDate" type="date" defaultValue={toInputDate(plan?.endDate)} className="input" />
        </Field>
        <div className="space-y-3 sm:col-span-2">
          <p className="label">Options</p>
          {options.map((o) => (
            <label key={o.name} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={o.name} defaultChecked={plan ? Boolean(plan[o.name]) : o.default} className="mt-0.5" />
              <span>
                <span className="font-medium">{o.label}</span>
                <span className="block text-xs text-zinc-500">{o.hint}</span>
              </span>
            </label>
          ))}
          {plan && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={plan.active} /> Active
            </label>
          )}
        </div>
        {!readOnly && (
          <div className="sm:col-span-2">
            <SubmitButton>{plan ? "Save plan" : "Create plan"}</SubmitButton>
          </div>
        )}
      </fieldset>
    </ActionForm>
  );
}
