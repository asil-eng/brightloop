// Money is stored in minor units (e.g. paise). These helpers convert for display and input.

const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "INR";

const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
});

export function formatMoney(minor: number): string {
  return formatter.format(minor / 100);
}

/** Parse a user-entered amount like "1,499.50" into minor units. Returns NaN if invalid. */
export function toMinor(input: FormDataEntryValue | string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return NaN;
  const n = typeof input === "number" ? input : Number(String(input).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Minor units → plain decimal string for form inputs. */
export function toMajor(minor: number): string {
  return (minor / 100).toFixed(2);
}
