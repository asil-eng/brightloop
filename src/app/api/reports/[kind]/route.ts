import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { parseInputDate, startOfDay, toInputDate } from "@/lib/dates";
import { METHOD_LABEL } from "@/lib/status";

const LIMIT = 50_000;

function csv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) => r.map((v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\n");
}
const rupees = (minor: number) => (minor / 100).toFixed(2);

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role === "CUSTOMER") return new NextResponse("Forbidden", { status: 403 });
  const { kind } = await params;
  const { db } = user;
  const sp = new URL(req.url).searchParams;
  const today = startOfDay();
  let rows: (string | number | null)[][] = [];

  if (kind === "subscriptions") {
    const where: Prisma.SubscriptionWhereInput = {
      ...(sp.get("status") && { status: sp.get("status") as Prisma.EnumSubscriptionStatusFilter["equals"] }),
      ...(sp.get("planId") && { planId: sp.get("planId")! }),
    };
    const subs = await db.subscription.findMany({ where, include: { customer: true, plan: true }, orderBy: { number: "asc" }, take: LIMIT });
    rows = [["Number", "Customer", "Email", "Plan", "Status", "Start", "Expiry", "Next invoice", "Untaxed", "Tax", "Total"]];
    for (const s of subs) rows.push([s.number, s.customer.name, s.customer.email, s.plan.name, s.status, toInputDate(s.startDate), toInputDate(s.expiryDate), toInputDate(s.nextInvoiceDate), rupees(s.untaxed), rupees(s.taxTotal), rupees(s.total)]);
  } else if (kind === "payments") {
    const from = parseInputDate(sp.get("from"));
    const to = parseInputDate(sp.get("to"));
    const payments = await db.payment.findMany({
      where: from || to ? { date: { ...(from && { gte: from }), ...(to && { lte: new Date(to.getTime() + 86399999) }) } } : {},
      include: { invoice: { include: { customer: true } } },
      orderBy: { date: "asc" },
      take: LIMIT,
    });
    rows = [["Payment", "Date", "Customer", "Invoice", "Method", "Reference", "Note", "Amount"]];
    for (const p of payments) rows.push([p.number, toInputDate(p.date), p.invoice.customer.name, p.invoice.number, METHOD_LABEL[p.method], p.reference, p.note, rupees(p.amount)]);
  } else if (kind === "overdue") {
    const q = sp.get("q");
    const invoices = await db.invoice.findMany({
      where: { status: "CONFIRMED", dueDate: { lt: today }, ...(q && { customer: { name: { contains: q } } }) },
      include: { customer: true },
      orderBy: { dueDate: "asc" },
      take: LIMIT,
    });
    rows = [["Invoice", "Customer", "Email", "Invoice date", "Due date", "Days late", "Total", "Paid", "Amount due"]];
    for (const i of invoices) rows.push([i.number, i.customer.name, i.customer.email, toInputDate(i.invoiceDate), toInputDate(i.dueDate), Math.floor((today.getTime() - i.dueDate.getTime()) / 86400000), rupees(i.total), rupees(i.amountPaid), rupees(i.total - i.amountPaid)]);
  } else {
    return new NextResponse("Unknown report", { status: 404 });
  }

  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="brightloop-${kind}-${toInputDate(today)}.csv"`,
    },
  });
}
