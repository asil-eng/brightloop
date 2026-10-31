import type { BillingPeriod } from "@prisma/client";

export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Add months, clamping to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + months);
  const lastDay = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, lastDay));
  return x;
}

export function addPeriod(d: Date, period: BillingPeriod, interval = 1): Date {
  switch (period) {
    case "DAILY":
      return addDays(d, interval);
    case "WEEKLY":
      return addDays(d, 7 * interval);
    case "MONTHLY":
      return addMonths(d, interval);
    case "YEARLY":
      return addMonths(d, 12 * interval);
  }
}

export const PERIOD_LABEL: Record<BillingPeriod, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

export function periodLabel(period: BillingPeriod, interval: number): string {
  if (interval === 1) return PERIOD_LABEL[period];
  const unit = { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months", YEARLY: "years" }[period];
  return `Every ${interval} ${unit}`;
}

/** How many times a period fits in a month — used to normalise revenue to MRR. */
export function monthlyFactor(period: BillingPeriod, interval: number): number {
  const perMonth = { DAILY: 30, WEEKLY: 52 / 12, MONTHLY: 1, YEARLY: 1 / 12 }[period];
  return perMonth / interval;
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** yyyy-mm-dd for <input type="date"> */
export function toInputDate(d: Date | null | undefined): string {
  if (!d) return "";
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${m}-${day}`;
}

export function parseInputDate(v: FormDataEntryValue | null): Date | null {
  if (!v || typeof v !== "string") return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
