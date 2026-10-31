import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "./db";
import { formatDate } from "./dates";

// pdf-lib's standard fonts only cover WinAnsi, so amounts use "Rs." instead of the rupee sign.
function money(minor: number) {
  const sign = minor < 0 ? "-" : "";
  return `${sign}Rs. ${(Math.abs(minor) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ascii(s: string) {
  return s.replace(/[^\x20-\x7E]/g, "?");
}

export async function invoicePdf(invoiceId: string): Promise<Uint8Array> {
  const inv = await db.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lines: true, customer: true, subscription: true },
  });
  const company = await db.company.findUnique({ where: { id: 1 } });

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const purple = rgb(0.443, 0.294, 0.404);
  const grey = rgb(0.4, 0.4, 0.4);

  const text = (s: string, x: number, y: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const f = o.b ? bold : font;
    const size = o.size ?? 10;
    const str = ascii(s);
    const dx = o.right ? f.widthOfTextAtSize(str, size) : 0;
    page.drawText(str, { x: x - dx, y, size, font: f, color: o.color ?? rgb(0.1, 0.1, 0.1) });
  };

  // Header band
  page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: purple });
  text(company?.name ?? "Brightloop Software", 40, 806, { size: 18, b: true, color: rgb(1, 1, 1) });
  text(company?.email ?? "", 555, 812, { size: 9, color: rgb(1, 1, 1), right: true });
  text(company?.address ?? "", 555, 798, { size: 9, color: rgb(1, 1, 1), right: true });

  const title = inv.status === "DRAFT" ? "Draft Invoice" : `Invoice ${inv.number}`;
  text(title, 40, 745, { size: 20, b: true });
  text(`Status: ${inv.status}`, 40, 727, { color: grey });

  // Bill-to and dates
  text("Bill to", 40, 695, { b: true, color: grey, size: 9 });
  let y = 680;
  for (const l of [inv.customer.name, inv.customer.company, inv.customer.email, ...inv.customer.address.split("\n")].filter(Boolean)) {
    text(l, 40, y);
    y -= 14;
  }
  const meta: [string, string][] = [
    ["Invoice date", formatDate(inv.invoiceDate)],
    ["Due date", formatDate(inv.dueDate)],
  ];
  if (inv.subscription) meta.push(["Subscription", inv.subscription.number]);
  if (inv.periodStart) meta.push(["Period", `${formatDate(inv.periodStart)} - ${formatDate(inv.periodEnd)}`]);
  let my = 695;
  for (const [k, v] of meta) {
    text(k, 360, my, { color: grey, size: 9 });
    text(v, 555, my, { right: true });
    my -= 16;
  }

  // Lines table
  y = Math.min(y, my) - 20;
  page.drawRectangle({ x: 40, y: y - 6, width: 515, height: 22, color: rgb(0.95, 0.94, 0.95) });
  text("Description", 46, y, { b: true, size: 9 });
  text("Qty", 300, y, { b: true, size: 9, right: true });
  text("Unit price", 375, y, { b: true, size: 9, right: true });
  text("Taxes", 395, y, { b: true, size: 9 });
  text("Amount", 549, y, { b: true, size: 9, right: true });
  y -= 24;
  for (const l of inv.lines) {
    text(l.description.slice(0, 48), 46, y, { size: 9 });
    text(String(l.quantity), 300, y, { size: 9, right: true });
    text(money(l.unitPrice), 375, y, { size: 9, right: true });
    text(l.taxLabel.slice(0, 22), 395, y, { size: 8, color: grey });
    text(money(l.subtotal), 549, y, { size: 9, right: true });
    if (l.discountAmount) {
      y -= 12;
      text(`Discount: -${money(l.discountAmount)}`, 46, y, { size: 8, color: grey });
    }
    y -= 18;
    page.drawLine({ start: { x: 40, y: y + 10 }, end: { x: 555, y: y + 10 }, thickness: 0.5, color: rgb(0.88, 0.88, 0.9) });
  }

  // Totals
  y -= 6;
  const totals: [string, number, boolean?][] = [["Untaxed amount", inv.untaxed]];
  if (inv.discountTotal) totals.push(["Discount included", -inv.discountTotal]);
  totals.push(["Taxes", inv.taxTotal], ["Total", inv.total, true], ["Paid", inv.amountPaid], ["Amount due", inv.total - inv.amountPaid, true]);
  for (const [k, v, strong] of totals) {
    text(k, 420, y, { b: strong, size: strong ? 11 : 10, right: true });
    text(money(v), 549, y, { b: strong, size: strong ? 11 : 10, right: true });
    y -= 18;
  }

  text("Thank you for your business.", 40, 60, { color: grey, size: 9 });
  return pdf.save();
}
