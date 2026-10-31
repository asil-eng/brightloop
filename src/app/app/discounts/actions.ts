"use server";

import { revalidatePath } from "next/cache";
import type { Db } from "@/lib/db";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { UserError, bool, owned, required, safeAction, str } from "@/lib/action";
import { toMinor } from "@/lib/money";
import { parseInputDate } from "@/lib/dates";

async function readDiscount(db: Db, data: FormData) {
  const type = str(data, "type");
  const scope = str(data, "scope");
  if (type !== "FIXED" && type !== "PERCENT") throw new UserError("Choose a discount type.");
  if (scope !== "PRODUCTS" && scope !== "SUBSCRIPTION") throw new UserError("Choose what the discount applies to.");
  const raw = Number(str(data, "value"));
  if (!(raw > 0)) throw new UserError("Enter a discount value greater than zero.");
  if (type === "PERCENT" && raw > 100) throw new UserError("A percentage discount can't be more than 100%.");
  const value = type === "FIXED" ? toMinor(raw) : raw;

  const minPurchase = str(data, "minPurchase") ? toMinor(str(data, "minPurchase")) : null;
  const minQuantity = str(data, "minQuantity") ? Math.trunc(Number(str(data, "minQuantity"))) : null;
  const usageLimit = str(data, "usageLimit") ? Math.trunc(Number(str(data, "usageLimit"))) : null;
  if (minPurchase !== null && !(minPurchase >= 0)) throw new UserError("Enter a valid minimum purchase.");
  if (minQuantity !== null && !(minQuantity >= 1)) throw new UserError("Minimum quantity must be at least 1.");
  if (usageLimit !== null && !(usageLimit >= 1)) throw new UserError("Usage limit must be at least 1.");
  const startDate = parseInputDate(data.get("startDate"));
  const endDate = parseInputDate(data.get("endDate"));
  if (startDate && endDate && endDate < startDate) throw new UserError("The end date must be after the start date.");

  const productIds = await owned(db.product, data.getAll("productIds").map(String));
  if (scope === "PRODUCTS" && !productIds.length) throw new UserError("Choose at least one product.");

  // Subscriptions are entered by number, e.g. "SUB/00012, SUB/00040".
  const numbers = str(data, "subscriptions").split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const subs = numbers.length ? await db.subscription.findMany({ where: { number: { in: numbers } }, select: { id: true, number: true } }) : [];
  const missing = numbers.filter((n) => !subs.some((s) => s.number === n));
  if (missing.length) throw new UserError(`Unknown subscription number(s): ${missing.join(", ")}.`);

  return {
    fields: {
      name: required(data, "name", "Name"),
      type: type as "FIXED" | "PERCENT",
      scope: scope as "PRODUCTS" | "SUBSCRIPTION",
      value,
      minPurchase,
      minQuantity,
      usageLimit,
      startDate,
      endDate,
      active: data.has("id") ? bool(data, "active") : true,
    },
    productIds: scope === "PRODUCTS" ? productIds : [],
    subscriptionIds: scope === "SUBSCRIPTION" ? subs.map((s) => s.id) : [],
  };
}

export const createDiscount = safeAction(async (data) => {
  const { db } = await requireAdmin();
  const { fields, productIds, subscriptionIds } = await readDiscount(db, data);
  const d = await db.discount.create({
    data: { ...fields, products: { connect: productIds.map((id) => ({ id })) }, subscriptions: { connect: subscriptionIds.map((id) => ({ id })) } },
  });
  redirect(`/app/discounts/${d.id}`);
});

export const updateDiscount = safeAction(async (data) => {
  const { db } = await requireAdmin();
  const id = required(data, "id", "Discount");
  const { fields, productIds, subscriptionIds } = await readDiscount(db, data);
  await db.discount.update({
    where: { id },
    data: { ...fields, products: { set: productIds.map((id) => ({ id })) }, subscriptions: { set: subscriptionIds.map((id) => ({ id })) } },
  });
  revalidatePath(`/app/discounts/${id}`);
  return { ok: "Discount saved." };
});
