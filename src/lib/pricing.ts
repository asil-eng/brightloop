// Pure price/tax/discount calculations (no database access). All amounts in minor units.

export type TaxLike = { name: string; rate: number; priceIncluded: boolean };

export type LineAmounts = { subtotal: number; taxAmount: number; total: number };

/**
 * Compute a line's amounts from its gross amount (unit price × quantity, minus any discount).
 * Price-included taxes are extracted from the gross; excluded taxes are added on top.
 */
export function computeAmounts(gross: number, taxes: TaxLike[]): LineAmounts {
  const included = taxes.filter((t) => t.priceIncluded).reduce((s, t) => s + t.rate, 0);
  const excluded = taxes.filter((t) => !t.priceIncluded).reduce((s, t) => s + t.rate, 0);
  const base = Math.round(gross / (1 + included / 100));
  const taxAmount = gross - base + Math.round((base * excluded) / 100);
  return { subtotal: base, taxAmount, total: base + taxAmount };
}

export function computeLine(unitPrice: number, quantity: number, taxes: TaxLike[], discount = 0): LineAmounts {
  return computeAmounts(Math.max(0, unitPrice * quantity - discount), taxes);
}

export function sumLines(lines: LineAmounts[]): LineAmounts {
  return lines.reduce(
    (acc, l) => ({ subtotal: acc.subtotal + l.subtotal, taxAmount: acc.taxAmount + l.taxAmount, total: acc.total + l.total }),
    { subtotal: 0, taxAmount: 0, total: 0 },
  );
}

export function taxLabel(taxes: TaxLike[]): string {
  return taxes.map((t) => `${t.name}${t.priceIncluded ? " (incl.)" : ""}`).join(", ");
}

// ───────────── Discounts ─────────────

export type DiscountRule = {
  id: string;
  name: string;
  type: "FIXED" | "PERCENT";
  value: number;
  scope: "PRODUCTS" | "SUBSCRIPTION";
  minPurchase: number | null;
  minQuantity: number | null;
  startDate: Date | null;
  endDate: Date | null;
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
  productIds: string[];
  subscriptionIds: string[];
};

export type PricedLine = { productId: string | null; unitPrice: number; quantity: number };

export function discountIsValid(d: DiscountRule, on: Date): boolean {
  if (!d.active) return false;
  if (d.startDate && on < d.startDate) return false;
  if (d.endDate && on > endOfDay(d.endDate)) return false;
  if (d.usageLimit !== null && d.usedCount >= d.usageLimit) return false;
  return true;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Work out how much each discount takes off each line for one invoice.
 * Returns per-line discount amounts plus which discount (if any) touched each line.
 * Each applicable discount is used once per invoice; discounts stack in order.
 */
export function applyDiscounts(
  lines: PricedLine[],
  discounts: DiscountRule[],
  subscriptionId: string | null,
  on: Date,
): { perLine: number[]; lineDiscountId: (string | null)[]; used: { id: string; amount: number }[] } {
  const perLine = lines.map(() => 0);
  const lineDiscountId: (string | null)[] = lines.map(() => null);
  const used: { id: string; amount: number }[] = [];
  const grossTotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  for (const d of discounts) {
    if (!discountIsValid(d, on)) continue;

    const matching = lines
      .map((l, i) => i)
      .filter((i) => {
        // Whole-subscription discounts apply to the selected subscriptions, or to all if none are selected.
        if (d.scope === "SUBSCRIPTION")
          return subscriptionId !== null && (d.subscriptionIds.length === 0 || d.subscriptionIds.includes(subscriptionId));
        return lines[i].productId !== null && d.productIds.includes(lines[i].productId!);
      });
    if (!matching.length) continue;

    const matchQty = matching.reduce((s, i) => s + lines[i].quantity, 0);
    if (d.minQuantity !== null && matchQty < d.minQuantity) continue;
    if (d.minPurchase !== null && grossTotal < d.minPurchase) continue;

    // Remaining (not yet discounted) amount on each matching line.
    const remaining = matching.map((i) => lines[i].unitPrice * lines[i].quantity - perLine[i]);
    const remainingTotal = remaining.reduce((s, v) => s + v, 0);
    if (remainingTotal <= 0) continue;

    const amount =
      d.type === "PERCENT"
        ? Math.round((remainingTotal * Math.min(d.value, 100)) / 100)
        : Math.min(Math.round(d.value), remainingTotal);
    if (amount <= 0) continue;

    // Spread the discount across matching lines proportionally; last line takes the rounding.
    let allocated = 0;
    matching.forEach((i, k) => {
      const share = k === matching.length - 1 ? amount - allocated : Math.round((amount * remaining[k]) / remainingTotal);
      perLine[i] += share;
      allocated += share;
      lineDiscountId[i] ??= d.id;
    });
    used.push({ id: d.id, amount });
  }

  return { perLine, lineDiscountId, used };
}
