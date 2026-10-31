"use server";

import { revalidatePath } from "next/cache";
import type { Db } from "@/lib/db";
import { redirect } from "next/navigation";
import type { ProductType } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { UserError, bool, owned, required, safeAction, str } from "@/lib/action";
import { toMinor } from "@/lib/money";

const TYPES: ProductType[] = ["SERVICE", "ADDON", "GOODS"];

function readProduct(data: FormData) {
  const name = required(data, "name", "Name");
  const type = str(data, "type") as ProductType;
  if (!TYPES.includes(type)) throw new UserError("Choose a product type.");
  const salesPrice = toMinor(str(data, "salesPrice"));
  const costPrice = toMinor(str(data, "costPrice") || "0");
  if (!(salesPrice >= 0)) throw new UserError("Enter a valid sales price.");
  if (!(costPrice >= 0)) throw new UserError("Enter a valid cost price.");
  return {
    name,
    type,
    salesPrice,
    costPrice,
    notes: str(data, "notes"),
    recurring: bool(data, "recurring"),
    active: data.has("active") ? bool(data, "active") : true,
    taxIds: data.getAll("taxIds").map(String),
  };
}

export const createProduct = safeAction(async (data) => {
  const { db } = await requireAdmin();
  const { taxIds, ...p } = readProduct(data);
  const taxes = await owned(db.tax, taxIds);
  const product = await db.product.create({ data: { ...p, taxes: { connect: taxes.map((id) => ({ id })) } } });
  redirect(`/app/products/${product.id}`);
});

export const updateProduct = safeAction(async (data) => {
  const { db } = await requireAdmin();
  const id = required(data, "id", "Product");
  const { taxIds, ...p } = readProduct(data);
  const taxes = await owned(db.tax, taxIds);
  await db.product.update({ where: { id }, data: { ...p, taxes: { set: taxes.map((id) => ({ id })) } } });
  revalidatePath(`/app/products/${id}`);
  return { ok: "Product saved." };
});

/** Rebuild the variant list as every combination of the product's attribute values. */
async function regenerateVariants(db: Db, productId: string) {
  const attributes = await db.attribute.findMany({ where: { productId }, include: { values: true }, orderBy: { id: "asc" } });
  let combos: { id: string; name: string; label: string; extra: number }[][] = [[]];
  for (const a of attributes) {
    if (!a.values.length) continue;
    combos = combos.flatMap((c) => a.values.map((v) => [...c, { id: v.id, name: v.name, label: a.name, extra: v.extraPrice }]));
  }
  const existing = await db.productVariant.findMany({ where: { productId }, include: { values: true } });
  const key = (ids: string[]) => [...ids].sort().join("|");
  const wanted = new Map(combos.filter((c) => c.length).map((c) => [key(c.map((v) => v.id)), c]));

  for (const v of existing) {
    const k = key(v.values.map((x) => x.id));
    const combo = wanted.get(k);
    if (combo) {
      // Keep the variant (it may be used on subscriptions) but refresh its name and price.
      await db.productVariant.update({
        where: { id: v.id },
        data: { name: combo.map((x) => `${x.label}: ${x.name}`).join(", "), extraPrice: combo.reduce((s, x) => s + x.extra, 0), active: true },
      });
      wanted.delete(k);
    } else {
      await db.productVariant.update({ where: { id: v.id }, data: { active: false } });
    }
  }
  for (const combo of wanted.values()) {
    await db.productVariant.create({
      data: {
        productId,
        name: combo.map((x) => `${x.label}: ${x.name}`).join(", "),
        extraPrice: combo.reduce((s, x) => s + x.extra, 0),
        values: { connect: combo.map((x) => ({ id: x.id })) },
      },
    });
  }
}

/** Values are entered one per line as "Name" or "Name: extra price", e.g. "Odoo: 560". */
function parseValues(text: string) {
  const values = text
    .split(/\r?\n|,/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, extra] = l.split(/[:=|]/).map((s) => s.trim());
      const extraPrice = extra ? toMinor(extra) : 0;
      if (!name || !(extraPrice >= 0)) throw new UserError(`Can't read the value "${l}". Use "Name: extra price".`);
      return { name, extraPrice };
    });
  if (!values.length) throw new UserError("Add at least one value.");
  return values;
}

export const saveAttribute = safeAction(async (data) => {
  const { db } = await requireAdmin();
  const productId = required(data, "productId", "Product");
  await db.product.findUniqueOrThrow({ where: { id: productId } }); // must be this company's product
  const name = required(data, "name", "Attribute name");
  const values = parseValues(required(data, "values", "Values"));
  const attributeId = str(data, "attributeId");

  if (attributeId) {
    await db.attribute.update({ where: { id: attributeId }, data: { name } });
    const current = await db.attributeValue.findMany({ where: { attributeId } });
    for (const v of values) {
      const match = current.find((c) => c.name.toLowerCase() === v.name.toLowerCase());
      if (match) await db.attributeValue.update({ where: { id: match.id }, data: v });
      else await db.attributeValue.create({ data: { ...v, attributeId } });
    }
    const keep = new Set(values.map((v) => v.name.toLowerCase()));
    const removed = current.filter((c) => !keep.has(c.name.toLowerCase()));
    if (removed.length) {
      // Detach removed values from variants first, then delete them.
      for (const r of removed) {
        const vs = await db.productVariant.findMany({ where: { values: { some: { id: r.id } } } });
        for (const v of vs) await db.productVariant.update({ where: { id: v.id }, data: { active: false, values: { disconnect: { id: r.id } } } });
      }
      await db.attributeValue.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
    }
  } else {
    await db.attribute.create({ data: { name, productId, values: { create: values } } });
  }
  await regenerateVariants(db, productId);
  revalidatePath(`/app/products/${productId}`);
  return { ok: "Attribute saved and variants updated." };
});

export const deleteAttribute = safeAction(async (data) => {
  const { db } = await requireAdmin();
  const attributeId = required(data, "attributeId", "Attribute");
  const attr = await db.attribute.findUniqueOrThrow({ where: { id: attributeId }, include: { values: true } });
  for (const val of attr.values) {
    const vs = await db.productVariant.findMany({ where: { values: { some: { id: val.id } } } });
    for (const v of vs) await db.productVariant.update({ where: { id: v.id }, data: { values: { disconnect: { id: val.id } } } });
  }
  await db.attribute.delete({ where: { id: attributeId } });
  await regenerateVariants(db, attr.productId);
  revalidatePath(`/app/products/${attr.productId}`);
  return { ok: "Attribute removed." };
});
