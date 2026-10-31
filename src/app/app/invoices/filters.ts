import type { Prisma } from "@prisma/client";
import { startOfDay } from "@/lib/dates";

/** Status filter values used across invoice lists and reports, including derived ones. */
export const INVOICE_FILTERS = [
  { value: "DRAFT", label: "Draft" },
  { value: "UNPAID", label: "Unpaid (confirmed)" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "PAID", label: "Paid" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function invoiceStatusWhere(status: string): Prisma.InvoiceWhereInput {
  switch (status) {
    case "DRAFT":
    case "PAID":
    case "CANCELLED":
      return { status };
    case "UNPAID":
      return { status: "CONFIRMED" };
    case "OVERDUE":
      return { status: "CONFIRMED", dueDate: { lt: startOfDay() } };
    default:
      return {};
  }
}
