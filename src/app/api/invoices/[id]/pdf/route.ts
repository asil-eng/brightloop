import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { invoicePdf } from "@/lib/pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const { id } = await params;
  const { db } = user;
  const invoice = await db.invoice.findUnique({ where: { id }, select: { number: true, customerId: true, status: true } });
  // Customers may only download their own, non-draft invoices.
  const allowed = invoice && (user.role !== "CUSTOMER" || (invoice.customerId === user.customer?.id && invoice.status !== "DRAFT"));
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  const pdf = await invoicePdf(db, id);
  const name = (invoice.number ?? "draft-invoice").replace(/\//g, "-");
  const download = new URL(req.url).searchParams.has("download");
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
