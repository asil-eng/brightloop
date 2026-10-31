"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BillingPeriod } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { UserError, bool, int, required, safeAction, str } from "@/lib/action";
import { toMinor } from "@/lib/money";
import { parseInputDate } from "@/lib/dates";

const PERIODS: BillingPeriod[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

function readPlan(data: FormData) {
  const period = str(data, "period") as BillingPeriod;
  if (!PERIODS.includes(period)) throw new UserError("Choose how often the plan bills.");
  const price = toMinor(str(data, "price") || "0");
  if (!(price >= 0)) throw new UserError("Enter a valid price.");
  const interval = int(data, "interval", 1);
  const minQuantity = int(data, "minQuantity", 1);
  if (interval < 1) throw new UserError("Billing interval must be at least 1.");
  if (minQuantity < 1) throw new UserError("Minimum quantity must be at least 1.");
  const startDate = parseInputDate(data.get("startDate"));
  const endDate = parseInputDate(data.get("endDate"));
  if (startDate && endDate && endDate < startDate) throw new UserError("The end date must be after the start date.");
  return {
    name: required(data, "name", "Plan name"),
    price,
    period,
    interval,
    minQuantity,
    startDate,
    endDate,
    autoClose: bool(data, "autoClose"),
    closable: bool(data, "closable"),
    pausable: bool(data, "pausable"),
    renewable: bool(data, "renewable"),
    active: data.has("id") ? bool(data, "active") : true,
  };
}

export const createPlan = safeAction(async (data) => {
  const { db } = await requireAdmin();
  const plan = await db.recurringPlan.create({ data: readPlan(data) });
  redirect(`/app/plans/${plan.id}`);
});

export const updatePlan = safeAction(async (data) => {
  const { db } = await requireAdmin();
  const id = required(data, "id", "Plan");
  await db.recurringPlan.update({ where: { id }, data: readPlan(data) });
  revalidatePath("/app/plans");
  return { ok: "Plan saved." };
});
