"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { computeLine, sumLines, type TaxLike } from "@/lib/pricing";
import { formatMoney } from "@/lib/money";

export type CatalogProduct = {
  id: string;
  name: string;
  type: string;
  price: number;
  taxIds: string[];
  variants: { id: string; name: string; extra: number }[];
};
export type CatalogTax = TaxLike & { id: string };

export type EditorLine = {
  productId: string | null;
  variantId: string | null;
  description: string;
  quantity: number;
  unitPrice: number; // minor units
  taxIds: string[];
};

/**
 * Editable product lines. Serialises to a hidden JSON input named `lines`.
 * With `pricing` on it also edits unit price and taxes and shows live totals
 * (the server recalculates everything on save).
 */
export function LineEditor({
  products,
  taxes,
  initial,
  pricing = true,
  minQuantity = 1,
}: {
  products: CatalogProduct[];
  taxes: CatalogTax[];
  initial: EditorLine[];
  pricing?: boolean;
  minQuantity?: number;
}) {
  const [lines, setLines] = useState<EditorLine[]>(initial);
  const byId = new Map(products.map((p) => [p.id, p]));
  const taxById = new Map(taxes.map((t) => [t.id, t]));

  const update = (i: number, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const chooseProduct = (i: number, productId: string) => {
    const p = byId.get(productId);
    if (!p) return;
    const v = p.variants[0] ?? null;
    update(i, {
      productId,
      variantId: v?.id ?? null,
      description: v ? `${p.name} (${v.name})` : p.name,
      unitPrice: p.price + (v?.extra ?? 0),
      taxIds: p.taxIds,
      quantity: Math.max(lines[i].quantity, minQuantity),
    });
  };

  const chooseVariant = (i: number, variantId: string) => {
    const p = byId.get(lines[i].productId ?? "");
    const v = p?.variants.find((x) => x.id === variantId);
    if (!p) return;
    update(i, { variantId: v?.id ?? null, description: v ? `${p.name} (${v.name})` : p.name, unitPrice: p.price + (v?.extra ?? 0) });
  };

  const amounts = lines.map((l) => computeLine(l.unitPrice, l.quantity, l.taxIds.map((id) => taxById.get(id)!).filter(Boolean)));
  const totals = sumLines(amounts);

  return (
    <div>
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div className="overflow-x-auto">
        <table className="table min-w-[56rem]">
          <thead>
            <tr>
              <th className="min-w-56">Product</th>
              <th className="min-w-48">Variant / description</th>
              <th className="w-24 text-right">Qty</th>
              {pricing && <th className="w-32 text-right">Unit price (₹)</th>}
              {pricing && <th className="w-28">Taxes</th>}
              {pricing && <th className="text-right">Amount</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const p = l.productId ? byId.get(l.productId) : null;
              return (
                <tr key={i}>
                  <td>
                    {l.productId === null && l.description && !p ? (
                      <span className="font-medium">{l.description}</span>
                    ) : (
                      <select className="input" value={l.productId ?? ""} onChange={(e) => chooseProduct(i, e.target.value)}>
                        <option value="">Choose a product…</option>
                        {products.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                            {x.type === "ADDON" ? " (add-on)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {p && p.variants.length > 0 ? (
                      <select className="input" value={l.variantId ?? ""} onChange={(e) => chooseVariant(i, e.target.value)}>
                        {p.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                            {v.extra ? ` (+${formatMoney(v.extra)})` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input className="input" value={l.description} onChange={(e) => update(i, { description: e.target.value })} />
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={l.productId ? minQuantity : 1}
                      className="input min-w-20 text-right"
                      value={l.quantity}
                      onChange={(e) => update(i, { quantity: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                    />
                  </td>
                  {pricing && (
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="input min-w-28 text-right"
                        value={(l.unitPrice / 100).toString()}
                        onChange={(e) => update(i, { unitPrice: Math.round((Number(e.target.value) || 0) * 100) })}
                      />
                    </td>
                  )}
                  {pricing && (
                    <td>
                      <div className="flex flex-col gap-0.5">
                        {taxes.map((t) => (
                          <label key={t.id} className="flex items-center gap-1 whitespace-nowrap text-xs">
                            <input
                              type="checkbox"
                              checked={l.taxIds.includes(t.id)}
                              onChange={(e) => update(i, { taxIds: e.target.checked ? [...l.taxIds, t.id] : l.taxIds.filter((x) => x !== t.id) })}
                            />
                            {t.name}
                          </label>
                        ))}
                      </div>
                    </td>
                  )}
                  {pricing && <td className="text-right tabular-nums">{formatMoney(amounts[i].subtotal)}</td>}
                  <td>
                    <button type="button" className="text-ink-secondary/70 hover:text-red-600" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label="Remove line">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <button
          type="button"
          className="text-sm font-medium text-brand-600 hover:underline"
          onClick={() => setLines((ls) => [...ls, { productId: "", variantId: null, description: "", quantity: minQuantity, unitPrice: 0, taxIds: [] }])}
        >
          + Add a line
        </button>
        {pricing && (
          <dl className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-ink-secondary">Untaxed</dt><dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-secondary">Taxes</dt><dd className="tabular-nums">{formatMoney(totals.taxAmount)}</dd></div>
            <div className="flex justify-between border-t border-rule pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(totals.total)}</dd></div>
          </dl>
        )}
      </div>
    </div>
  );
}
