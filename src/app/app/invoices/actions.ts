"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { requireBackoffice } from "@/lib/auth";
import { companyEmailConnected } from "@/lib/mail";
import { UserError, required, safeAction, str } from "@/lib/action";
import { cancelInvoice, confirmInvoice, registerPayment, sendInvoice } from "@/lib/billing";
import { toMinor } from "@/lib/money";
import { parseInputDate } from "@/lib/dates";

const METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "CARD", "UPI", "CHEQUE", "ONLINE"];

export const invoiceAction = safeAction(async (data) => {
  const user = await requireBackoffice();
  const { db } = user;
  const id = required(data, "id", "Invoice");
  const op = required(data, "op", "Action");
  let ok = "";
  if (op === "confirm") {
    await confirmInvoice(db, id, user.id);
    ok = "Invoice confirmed.";
  } else if (op === "cancel") {
    await cancelInvoice(db, id, user.id);
    ok = "Invoice cancelled.";
  } else if (op === "send") {
    const sent = await sendInvoice(db, id, user.id);
    ok = sent ? "Invoice emailed to the customer." : "";
    if (!sent) {
      throw new UserError(
        companyEmailConnected(user.org)
          ? "The email could not be sent. Check Settings → Email and the recent emails list."
          : "Not sent: connect your company email in Settings → Email first. You can still download the PDF and send it yourself.",
      );
    }
  } else throw new UserError("Unknown action.");
  revalidatePath(`/app/invoices/${id}`);
  return { ok };
});

export const recordPayment = safeAction(async (data) => {
  const user = await requireBackoffice();
  const { db } = user;
  const invoiceId = required(data, "invoiceId", "Invoice");
  const method = str(data, "method") as PaymentMethod;
  if (!METHODS.includes(method)) throw new UserError("Choose a payment method.");
  const amount = toMinor(str(data, "amount"));
  if (!(amount > 0)) throw new UserError("Enter an amount greater than zero.");
  const date = parseInputDate(data.get("date")) ?? new Date();
  if (date > new Date()) throw new UserError("The payment date can't be in the future.");
  await registerPayment(db, { invoiceId, amount, method, date, note: str(data, "note"), reference: str(data, "reference"), userId: user.id });
  revalidatePath(`/app/invoices/${invoiceId}`);
  return { ok: "Payment recorded." };
});
