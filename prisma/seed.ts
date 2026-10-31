/* eslint-disable no-console */
// Demo data for Brightloop Software: catalogue, plans, discounts, demo logins and
// ~1,200 subscriptions with a year of invoices and payments (to prove pages stay fast).
// Run with: npm run db:seed   (wipes existing data)

import { PrismaClient, type Prisma, type BillingPeriod, type PaymentMethod, type SubscriptionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { computeLine, sumLines, taxLabel } from "../src/lib/pricing";
import { addDays, addPeriod, startOfDay } from "../src/lib/dates";

const db = new PrismaClient();
const SUBSCRIPTIONS = Number(process.env.SEED_SUBSCRIPTIONS ?? 1200);

// Deterministic pseudo-random numbers so every seed produces the same data.
let rngState = 42;
const rand = () => {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
};
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
const id = () => crypto.randomUUID();

const FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Ananya", "Vikram", "Isha", "Arjun", "Sara", "Nikhil", "Priya", "Rahul", "Neha", "Karan", "Leela", "Omar", "Fatima", "John", "Emma", "Liam", "Sophia", "Noah", "Mia"];
const LAST = ["Sharma", "Patel", "Nair", "Menon", "Gupta", "Iyer", "Khan", "Reddy", "Das", "Singh", "Joseph", "Thomas", "Mehta", "Bose", "Kapoor", "Smith", "Brown", "Wilson"];
const BIZ = ["Traders", "Studio", "Labs", "Foods", "Retail", "Logistics", "Clinic", "Textiles", "Motors", "Digital", "Ventures", "Exports", "Bakery", "Pharma", "Solutions"];
const CITIES = ["Kochi", "Bengaluru", "Chennai", "Mumbai", "Pune", "Hyderabad", "Delhi", "Kozhikode", "Thrissur", "Coimbatore"];

async function wipe() {
  // Order matters because of foreign keys.
  await db.activity.deleteMany();
  await db.emailLog.deleteMany();
  await db.payment.deleteMany();
  await db.invoiceLine.deleteMany();
  await db.invoice.deleteMany();
  await db.discount.deleteMany();
  await db.subscriptionLine.deleteMany();
  await db.subscription.deleteMany();
  await db.templateLine.deleteMany();
  await db.quotationTemplate.deleteMany();
  await db.productVariant.deleteMany();
  await db.attributeValue.deleteMany();
  await db.attribute.deleteMany();
  await db.product.deleteMany();
  await db.tax.deleteMany();
  await db.recurringPlan.deleteMany();
  await db.paymentTerm.deleteMany();
  await db.closeReason.deleteMany();
  await db.customer.deleteMany();
  await db.session.deleteMany();
  await db.passwordResetToken.deleteMany();
  await db.user.deleteMany();
  await db.sequence.deleteMany();
  await db.company.deleteMany();
}

async function main() {
  const t0 = Date.now();
  console.log("Wiping database…");
  await wipe();

  await db.company.create({
    data: { id: 1, name: "Brightloop Software", email: "billing@brightloop.test", phone: "+91 484 400 1234", address: "Infopark Phase 2, Kakkanad\nKochi, Kerala 682042" },
  });

  // ───────────── Users ─────────────
  const hash = (p: string) => bcrypt.hash(p, 10);
  const admin = await db.user.create({ data: { email: "admin@brightloop.test", name: "Anita Admin", role: "ADMIN", passwordHash: await hash("Admin@1234") } });
  const staff = await db.user.create({ data: { email: "staff@brightloop.test", name: "Sam Staff", role: "STAFF", passwordHash: await hash("Staff@1234") } });
  const portalUser = await db.user.create({ data: { email: "customer@brightloop.test", name: "Meera Nair", role: "CUSTOMER", passwordHash: await hash("Customer@123") } });

  // ───────────── Settings data ─────────────
  const [gst18, gst5] = await Promise.all([
    db.tax.create({ data: { name: "GST 18%", rate: 18 } }),
    db.tax.create({ data: { name: "GST 5%", rate: 5 } }),
  ]);
  await db.tax.create({ data: { name: "GST 12%", rate: 12 } });

  const [immediate, net15, net30] = await Promise.all([
    db.paymentTerm.create({ data: { name: "Immediate payment", dueDays: 0 } }),
    db.paymentTerm.create({ data: { name: "15 days", dueDays: 15 } }),
    db.paymentTerm.create({ data: { name: "30 days", dueDays: 30 } }),
  ]);
  const reasons = await Promise.all(
    ["Too expensive", "Switched to another provider", "No longer needed", "Contract ended", "Quotation expired"].map((name) => db.closeReason.create({ data: { name } })),
  );

  // ───────────── Products & variants ─────────────
  async function product(p: { name: string; type: "SERVICE" | "ADDON" | "GOODS"; price: number; cost: number; notes: string; tax: string; attribute?: { name: string; values: [string, number][] } }) {
    const prod = await db.product.create({
      data: { name: p.name, type: p.type, salesPrice: p.price * 100, costPrice: p.cost * 100, notes: p.notes, taxes: { connect: [{ id: p.tax }] } },
    });
    const variants: { id: string; name: string; extra: number }[] = [];
    if (p.attribute) {
      const attr = await db.attribute.create({ data: { name: p.attribute.name, productId: prod.id } });
      for (const [name, extra] of p.attribute.values) {
        const value = await db.attributeValue.create({ data: { name, extraPrice: extra * 100, attributeId: attr.id } });
        const v = await db.productVariant.create({
          data: { productId: prod.id, name: `${p.attribute.name}: ${name}`, extraPrice: extra * 100, values: { connect: [{ id: value.id }] } },
        });
        variants.push({ id: v.id, name: v.name, extra: extra * 100 });
      }
    }
    return { ...prod, variants, tax: p.tax };
  }

  const crm = await product({ name: "Brightloop CRM", type: "SERVICE", price: 1200, cost: 300, notes: "Customer relationship management, per user per period.", tax: gst18.id, attribute: { name: "Brand", values: [["Generic", 0], ["Odoo", 560]] } });
  const books = await product({ name: "Brightloop Books", type: "SERVICE", price: 1500, cost: 400, notes: "Accounting and invoicing, per user.", tax: gst18.id, attribute: { name: "Edition", values: [["Standard", 0], ["Enterprise", 900]] } });
  const hr = await product({ name: "Brightloop HR", type: "SERVICE", price: 900, cost: 250, notes: "Payroll, leave and attendance.", tax: gst18.id });
  const storage = await product({ name: "Extra Storage (100 GB)", type: "ADDON", price: 300, cost: 60, notes: "Add-on: additional cloud storage.", tax: gst18.id });
  const support = await product({ name: "Priority Support", type: "ADDON", price: 800, cost: 200, notes: "Add-on: 4-hour response time.", tax: gst18.id });
  const seat = await product({ name: "Extra User Seat", type: "ADDON", price: 250, cost: 50, notes: "Add-on: one more user.", tax: gst18.id });
  const training = await product({ name: "Training Hours", type: "SERVICE", price: 600, cost: 300, notes: "Live training sessions.", tax: gst5.id });
  const mainProducts = [crm, books, hr];
  const addons = [storage, support, seat];

  // ───────────── Plans ─────────────
  const year = new Date().getFullYear();
  const plan = (data: { name: string; price: number; period: BillingPeriod; autoClose?: boolean; closable?: boolean; pausable?: boolean; renewable?: boolean; minQuantity?: number; endDate?: Date }) =>
    db.recurringPlan.create({ data: { ...data, price: data.price * 100, startDate: new Date(year - 2, 0, 1) } });
  const monthly = await plan({ name: "Monthly", price: 999, period: "MONTHLY" });
  const yearly = await plan({ name: "Yearly", price: 9999, period: "YEARLY", pausable: false });
  const yearlyFixed = await plan({ name: "Yearly Contract (fixed term)", price: 8999, period: "YEARLY", autoClose: true, closable: false, pausable: false, renewable: true, minQuantity: 5 });
  const weekly = await plan({ name: "Weekly", price: 299, period: "WEEKLY" });
  const daily = await plan({ name: "Daily Pay-as-you-go", price: 49, period: "DAILY", renewable: false });

  // ───────────── Quotation templates ─────────────
  await db.quotationTemplate.create({
    data: {
      name: "Starter (Monthly)",
      planId: monthly.id,
      validityDays: 15,
      paymentTermId: immediate.id,
      note: "Everything a small business needs to get started.",
      lines: { create: [{ productId: crm.id, variantId: crm.variants[0].id, quantity: 3 }, { productId: storage.id, quantity: 1 }] },
    },
  });
  await db.quotationTemplate.create({
    data: {
      name: "Enterprise (Yearly)",
      planId: yearly.id,
      validityDays: 30,
      paymentTermId: net30.id,
      note: "Full suite for large teams on a yearly contract.",
      lines: {
        create: [
          { productId: crm.id, variantId: crm.variants[1].id, quantity: 25 },
          { productId: books.id, variantId: books.variants[1].id, quantity: 10 },
          { productId: hr.id, quantity: 25 },
          { productId: support.id, quantity: 1 },
        ],
      },
    },
  });

  // ───────────── Customers ─────────────
  console.log("Creating customers…");
  const customerRows = Array.from({ length: Math.max(50, Math.round(SUBSCRIPTIONS / 3)) }, (_, i) => {
    const first = pick(FIRST);
    const last = pick(LAST);
    const company = `${last} ${pick(BIZ)}`;
    return {
      id: id(),
      name: i === 0 ? "Meera Nair" : `${first} ${last}`,
      email: i === 0 ? "customer@brightloop.test" : `${first}.${last}.${i}@example.com`.toLowerCase(),
      company: i === 0 ? "Nair Textiles" : company,
      phone: `+91 9${between(100000000, 999999999)}`,
      address: `${between(1, 200)}, ${pick(["MG Road", "Market Street", "Park Avenue", "Station Road"])}\n${pick(CITIES)}, India`,
      userId: i === 0 ? portalUser.id : null,
    };
  });
  await db.customer.createMany({ data: customerRows });

  // ───────────── Subscriptions, invoices, payments ─────────────
  console.log(`Creating ${SUBSCRIPTIONS} subscriptions with history…`);
  const today = startOfDay();
  const taxes = { [gst18.id]: gst18, [gst5.id]: gst5 };
  let subNo = 1;
  let invNo = 1;
  let payNo = 1;
  const invoiceRows: Prisma.InvoiceCreateManyInput[] = [];
  const invoiceLineRows: Prisma.InvoiceLineCreateManyInput[] = [];
  const paymentRows: Prisma.PaymentCreateManyInput[] = [];
  const activityRows: Prisma.ActivityCreateManyInput[] = [];
  const statusPool: SubscriptionStatus[] = [
    ...Array(70).fill("ACTIVE"),
    ...Array(7).fill("PAUSED"),
    ...Array(10).fill("CLOSED"),
    ...Array(6).fill("QUOTATION"),
    ...Array(4).fill("DRAFT"),
    ...Array(3).fill("CONFIRMED"),
  ];
  const methods: PaymentMethod[] = ["BANK_TRANSFER", "BANK_TRANSFER", "CARD", "UPI", "UPI", "ONLINE", "CASH", "CHEQUE"];

  for (let n = 0; n < SUBSCRIPTIONS; n++) {
    // The demo portal customer gets three subscriptions with known shapes.
    const isDemo = n < 3;
    const customer = isDemo ? customerRows[0] : customerRows[1 + Math.floor(rand() * (customerRows.length - 1))];
    const r = rand();
    const thePlan = isDemo ? [yearly, monthly, monthly][n] : r < 0.6 ? monthly : r < 0.85 ? yearly : r < 0.95 ? yearlyFixed : r < 0.98 ? weekly : daily;
    const status: SubscriptionStatus = isDemo ? (["ACTIVE", "ACTIVE", "PAUSED"] as const)[n] : pick(statusPool);

    let startDate: Date;
    if (status === "QUOTATION" || status === "DRAFT") startDate = addDays(today, between(1, 20));
    else if (status === "CONFIRMED") startDate = addDays(today, between(1, 10));
    else if (thePlan.period === "DAILY") startDate = addDays(today, -between(3, 20));
    else if (thePlan.period === "WEEKLY") startDate = addDays(today, -between(14, 120));
    else if (thePlan.period === "YEARLY") startDate = addDays(today, -between(20, 700));
    else startDate = addDays(today, -between(5, 420));
    startDate = startOfDay(startDate);

    const expiryDate = thePlan.period === "YEARLY" ? addDays(addPeriod(startDate, "YEARLY", thePlan.id === yearlyFixed.id ? 2 : 1), -1) : null;

    // Lines: plan fee + 1–2 products + maybe add-ons.
    const mains = isDemo ? [mainProducts[n]] : [pick(mainProducts), ...(rand() < 0.3 ? [pick(mainProducts)] : [])];
    const lines: { productId: string | null; variantId: string | null; description: string; quantity: number; unitPrice: number; taxId: string }[] = [];
    if (thePlan.price > 0) lines.push({ productId: null, variantId: null, description: `${thePlan.name} plan`, quantity: 1, unitPrice: thePlan.price, taxId: gst18.id });
    for (const p of new Set(mains)) {
      const v = p.variants.length ? pick(p.variants) : null;
      const qty = Math.max(thePlan.minQuantity, thePlan.period === "YEARLY" ? between(5, 40) : between(1, 12));
      lines.push({ productId: p.id, variantId: v?.id ?? null, description: v ? `${p.name} (${v.name})` : p.name, quantity: qty, unitPrice: p.salesPrice + (v?.extra ?? 0), taxId: p.tax });
    }
    if (rand() < 0.45 || isDemo) {
      const a = pick(addons);
      lines.push({ productId: a.id, variantId: null, description: a.name, quantity: a.id === seat.id ? between(2, 15) : 1, unitPrice: a.salesPrice, taxId: a.tax });
    }
    if (rand() < 0.08) lines.push({ productId: training.id, variantId: null, description: training.name, quantity: between(2, 10), unitPrice: training.salesPrice, taxId: training.tax });

    const amounts = lines.map((l) => computeLine(l.unitPrice, l.quantity, [taxes[l.taxId]]));
    const totals = sumLines(amounts);

    // Billing history: invoice every period from the start date up to today (or close date).
    const closedAt = status === "CLOSED" ? addDays(today, -between(1, 60)) : null;
    const pausedAt = status === "PAUSED" ? addDays(today, -between(5, 40)) : null;
    const billedUntil = closedAt ?? pausedAt ?? today;
    const subId = id();
    const number = `SUB/${String(subNo++).padStart(5, "0")}`;
    const paymentTerm = thePlan.period === "YEARLY" ? net30 : rand() < 0.5 ? net15 : immediate;
    let periodStart = startDate;
    let nextInvoiceDate: Date | null = null;

    if (["ACTIVE", "PAUSED", "CLOSED"].includes(status)) {
      while (periodStart <= billedUntil && (!expiryDate || periodStart <= expiryDate)) {
        const next = addPeriod(periodStart, thePlan.period, thePlan.interval);
        const invId = id();
        const invoiceDate = periodStart;
        const dueDate = addDays(invoiceDate, paymentTerm.dueDays);
        const age = (today.getTime() - dueDate.getTime()) / 86400000;
        // Older invoices are almost always paid; recent ones are a mix; some are overdue.
        const paidChance = age > 45 ? 0.97 : age > 0 ? 0.6 : 0.35;
        const willPay = rand() < paidChance;
        const partial = !willPay && rand() < 0.15;
        const amountPaid = willPay ? totals.total : partial ? Math.round(totals.total / 2) : 0;
        const invNumber = `INV/${invoiceDate.getFullYear()}/${String(invNo++).padStart(5, "0")}`;
        invoiceRows.push({
          id: invId,
          number: invNumber,
          billingKey: `${subId}:${periodStart.toISOString().slice(0, 10)}`,
          subscriptionId: subId,
          customerId: customer.id,
          status: willPay ? "PAID" : "CONFIRMED",
          invoiceDate,
          dueDate,
          periodStart,
          periodEnd: addDays(next, -1),
          untaxed: totals.subtotal,
          taxTotal: totals.taxAmount,
          total: totals.total,
          amountPaid,
          sentAt: invoiceDate,
          createdAt: invoiceDate,
        });
        lines.forEach((l, i) =>
          invoiceLineRows.push({ id: id(), invoiceId: invId, productId: l.productId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxLabel: taxLabel([taxes[l.taxId]]), ...amounts[i] }),
        );
        if (amountPaid > 0) {
          const payDate = addDays(invoiceDate, between(0, Math.max(1, paymentTerm.dueDays + 5)));
          paymentRows.push({
            id: id(),
            number: `PAY/${String(payNo++).padStart(5, "0")}`,
            invoiceId: invId,
            amount: amountPaid,
            method: pick(methods),
            date: payDate > today ? today : payDate,
            note: partial ? "Part payment" : "",
            reference: `TXN${between(100000, 999999)}`,
            createdById: staff.id,
          });
        }
        periodStart = next;
      }
      if (status === "ACTIVE") nextInvoiceDate = !expiryDate || periodStart <= expiryDate ? periodStart : null;
      if (status === "PAUSED") nextInvoiceDate = periodStart;
    }

    await db.subscription.create({
      data: {
        id: subId,
        number,
        customerId: customer.id,
        planId: thePlan.id,
        status,
        startDate,
        expiryDate,
        nextInvoiceDate,
        quoteValidUntil: status === "QUOTATION" ? addDays(today, between(3, 20)) : null,
        paymentTermId: paymentTerm.id,
        salespersonId: rand() < 0.5 ? staff.id : admin.id,
        closedAt,
        closeReasonId: closedAt ? pick(reasons.slice(0, 3)).id : null,
        untaxed: totals.subtotal,
        taxTotal: totals.taxAmount,
        total: totals.total,
        createdAt: addDays(startDate, -between(1, 10)),
        lines: {
          create: lines.map((l, i) => ({
            productId: l.productId,
            variantId: l.variantId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            ...amounts[i],
            taxes: { connect: [{ id: l.taxId }] },
          })),
        },
      },
    });
    activityRows.push({ id: id(), entityType: "subscription", entityId: subId, message: "Subscription created.", userId: staff.id, createdAt: addDays(startDate, -1) });
    if (status === "CLOSED") activityRows.push({ id: id(), entityType: "subscription", entityId: subId, message: "Subscription closed.", userId: staff.id, createdAt: closedAt! });
  }

  console.log(`Writing ${invoiceRows.length} invoices, ${paymentRows.length} payments…`);
  const chunk = async <T,>(rows: T[], fn: (batch: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 500) await fn(rows.slice(i, i + 500));
  };
  await chunk(invoiceRows, (b) => db.invoice.createMany({ data: b }));
  await chunk(invoiceLineRows, (b) => db.invoiceLine.createMany({ data: b }));
  await chunk(paymentRows, (b) => db.payment.createMany({ data: b }));
  await chunk(activityRows, (b) => db.activity.createMany({ data: b }));

  // ───────────── Discounts ─────────────
  await db.discount.create({
    data: { name: "Volume seats — 10% off 10+ seats", type: "PERCENT", value: 10, scope: "PRODUCTS", minQuantity: 10, startDate: new Date(year, 0, 1), endDate: new Date(year + 1, 11, 31), products: { connect: [{ id: seat.id }, { id: crm.id }] } },
  });
  const welcomeSubs = await db.subscription.findMany({ where: { status: "ACTIVE", plan: { period: "MONTHLY" } }, take: 15, select: { id: true } });
  await db.discount.create({
    data: { name: "Loyalty — ₹500 off", type: "FIXED", value: 50000, scope: "SUBSCRIPTION", minPurchase: 200000, usageLimit: 30, startDate: addDays(today, -30), endDate: addDays(today, 180), subscriptions: { connect: welcomeSubs.map((s) => ({ id: s.id })) } },
  });
  await db.discount.create({
    data: { name: "Festival — 15% off (ended)", type: "PERCENT", value: 15, scope: "SUBSCRIPTION", startDate: addDays(today, -60), endDate: addDays(today, -30), active: false },
  });

  await db.sequence.createMany({
    data: [
      { name: "subscription", next: subNo },
      { name: "invoice", next: invNo },
      { name: "payment", next: payNo },
    ],
  });

  console.log(`\n✅ Seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("   Admin:    admin@brightloop.test    / Admin@1234");
  console.log("   Staff:    staff@brightloop.test    / Staff@1234");
  console.log("   Customer: customer@brightloop.test / Customer@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
