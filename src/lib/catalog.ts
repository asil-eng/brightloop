import "server-only";
import type { Db } from "./db";
import { UserError } from "./action";
import type { CatalogProduct, CatalogTax, EditorLine } from "@/components/line-editor";

export async function loadCatalog(db: Db): Promise<{ products: CatalogProduct[]; taxes: CatalogTax[] }> {
  const [products, taxes] = await Promise.all([
    db.product.findMany({
      where: { active: true, recurring: true },
      include: { taxes: { select: { id: true } }, variants: { where: { active: true }, orderBy: { extraPrice: "asc" } } },
      orderBy: { name: "asc" },
    }),
    db.tax.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      price: p.salesPrice,
      taxIds: p.taxes.map((t) => t.id),
      variants: p.variants.map((v) => ({ id: v.id, name: v.name, extra: v.extraPrice })),
    })),
    taxes: taxes.map((t) => ({ id: t.id, name: t.name, rate: t.rate, priceIncluded: t.priceIncluded })),
  };
}

export type ParsedLine = EditorLine;

/** Validate the JSON produced by <LineEditor>. Product lines must meet the plan's minimum quantity. */
export async function parseLines(db: Db, raw: string, opts: { minQuantity?: number; allowEmpty?: boolean } = {}): Promise<ParsedLine[]> {
  let input: unknown;
  try {
    input = JSON.parse(raw || "[]");
  } catch {
    throw new UserError("Could not read the lines.");
  }
  if (!Array.isArray(input)) throw new UserError("Could not read the lines.");
  const lines = input as EditorLine[];
  if (!lines.length && !opts.allowEmpty) throw new UserError("Add at least one line.");

  const productIds = [...new Set(lines.map((l) => l.productId).filter(Boolean))] as string[];
  const [products, taxes] = await Promise.all([
    db.product.findMany({ where: { id: { in: productIds } }, include: { variants: true } }),
    db.tax.findMany({ select: { id: true } }),
  ]);
  const validTax = new Set(taxes.map((t) => t.id));
  const minQ = opts.minQuantity ?? 1;

  return lines.map((l, i) => {
    const n = i + 1;
    const qty = Math.trunc(Number(l.quantity));
    const unitPrice = Math.round(Number(l.unitPrice));
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new UserError(`Line ${n}: enter a valid unit price.`);
    const taxIds = (Array.isArray(l.taxIds) ? l.taxIds : []).filter((t) => validTax.has(t));

    if (l.productId === null) {
      // Free-text line such as the plan fee.
      if (!l.description?.trim()) throw new UserError(`Line ${n}: choose a product.`);
      if (!(qty >= 1)) throw new UserError(`Line ${n}: quantity must be at least 1.`);
      return { productId: null, variantId: null, description: l.description.trim(), quantity: qty, unitPrice, taxIds };
    }
    const p = products.find((x) => x.id === l.productId);
    if (!p) throw new UserError(`Line ${n}: choose a product.`);
    const variant = l.variantId ? p.variants.find((v) => v.id === l.variantId) : null;
    if (l.variantId && !variant) throw new UserError(`Line ${n}: the variant doesn't belong to ${p.name}.`);
    if (!(qty >= minQ)) throw new UserError(`Line ${n}: the plan requires a minimum quantity of ${minQ}.`);
    return {
      productId: p.id,
      variantId: variant?.id ?? null,
      description: l.description?.trim() || (variant ? `${p.name} (${variant.name})` : p.name),
      quantity: qty,
      unitPrice,
      taxIds,
    };
  });
}
