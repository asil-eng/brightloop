import { startOfDay } from "./dates";

type InvoiceLike = { status: string; dueDate: Date; total: number; amountPaid: number };

export function isOverdue(i: InvoiceLike, today = startOfDay()) {
  return i.status === "CONFIRMED" && i.dueDate < today && i.amountPaid < i.total;
}

/** Badge for an invoice, adding Overdue / Partially paid on top of the stored status. */
export function invoiceBadge(i: InvoiceLike): { status: string; label?: string } {
  if (isOverdue(i)) return { status: "OVERDUE", label: i.amountPaid > 0 ? "Overdue · part paid" : "Overdue" };
  if (i.status === "CONFIRMED" && i.amountPaid > 0) return { status: "PARTIAL", label: "Partially paid" };
  if (i.status === "CONFIRMED") return { status: "CONFIRMED", label: "Unpaid" };
  return { status: i.status };
}

export const SUBSCRIPTION_STAGES = ["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "CLOSED"];
export const INVOICE_STAGES = ["DRAFT", "CONFIRMED", "PAID"];

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  UPI: "UPI",
  CHEQUE: "Cheque",
  ONLINE: "Online (portal)",
};
