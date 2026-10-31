// Demo data: two companies that use the platform, each with its own catalogue, plans,
// discounts, team, customers and a year of invoices and payments.
//   - Brightloop Software (the company from the brief), ~1,200 subscriptions
//   - Nimbus Fitness, a gym chain, ~200 subscriptions
// Run with: npm run db:seed   (wipes existing data)

import { type Prisma, type BillingPeriod, type PaymentMethod, type SubscriptionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { computeLine, sumLines, taxLabel } from "../src/lib/pricing";
import { addDays, addPeriod, startOfDay } from "../src/lib/dates";
import { rootDb } from "../src/lib/db";
import { setUpCompany } from "../src/lib/company";

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
  await rootDb.activity.deleteMany();
  await rootDb.emailLog.deleteMany();
  await rootDb.payment.deleteMany();
  await rootDb.invoiceLine.deleteMany();
  await rootDb.invoice.deleteMany();
  await rootDb.discount.deleteMany();
  await rootDb.subscriptionLine.deleteMany();
  await rootDb.subscription.deleteMany();
  await rootDb.templateLine.deleteMany();
  await rootDb.quotationTemplate.deleteMany();
  await rootDb.productVariant.deleteMany();
  await rootDb.attributeValue.deleteMany();
  await rootDb.attribute.deleteMany();
  await rootDb.product.deleteMany();
  await rootDb.tax.deleteMany();
  await rootDb.recurringPlan.deleteMany();
  await rootDb.paymentTerm.deleteMany();
  await rootDb.closeReason.deleteMany();
  await rootDb.customer.deleteMany();
  await rootDb.session.deleteMany();
  await rootDb.passwordResetToken.deleteMany();
  await rootDb.user.deleteMany();
  await rootDb.sequence.deleteMany();
  await rootDb.organization.deleteMany();
}

type ProductSpec = { name: string; type: "SERVICE" | "ADDON" | "GOODS"; price: number; cost: number; notes: string; tax: "GST 18%" | "GST 5%"; attribute?: { name: string; values: [string, number][] }; perSeat?: boolean };
type PlanSpec = { name: string; price: number; period: BillingPeriod; autoClose?: boolean; closable?: boolean; pausable?: boolean; renewable?: boolean; minQuantity?: number };

type CompanySpec = {
  name: string;
  email: string;
  phone: string;
  address: string;
  domain: string; // for demo logins: admin@<domain>, staff@<domain>, customer@<domain>
  admin: string;
  staff: string;
  customer: { name: string; company: string };
  subscriptions: number;
  main: ProductSpec[];
  addons: ProductSpec[];
  extra: ProductSpec;
  plans: { monthly: PlanSpec; yearly: PlanSpec; yearlyFixed: PlanSpec; weekly: PlanSpec; daily: PlanSpec };
  templates: { name: string; plan: "monthly" | "yearly"; validityDays: number; note: string; lines: { product: number; variant?: number; quantity: number; addon?: boolean }[] }[];
};

const COMPANIES: CompanySpec[] = [
  {
    name: "Brightloop Software",
    email: "billing@brightloop.test",
    phone: "+91 484 400 1234",
    address: "Infopark Phase 2, Kakkanad\nKochi, Kerala 682042",
    domain: "brightloop.test",
    admin: "Anita Admin",
    staff: "Sam Staff",
    customer: { name: "Meera Nair", company: "Nair Textiles" },
    subscriptions: SUBSCRIPTIONS,
    main: [
      { name: "Brightloop CRM", type: "SERVICE", price: 1200, cost: 300, notes: "Customer relationship management, per user per period.", tax: "GST 18%", attribute: { name: "Brand", values: [["Generic", 0], ["Odoo", 560]] } },
      { name: "Brightloop Books", type: "SERVICE", price: 1500, cost: 400, notes: "Accounting and invoicing, per user.", tax: "GST 18%", attribute: { name: "Edition", values: [["Standard", 0], ["Enterprise", 900]] } },
      { name: "Brightloop HR", type: "SERVICE", price: 900, cost: 250, notes: "Payroll, leave and attendance.", tax: "GST 18%" },
    ],
    addons: [
      { name: "Extra Storage (100 GB)", type: "ADDON", price: 300, cost: 60, notes: "Add-on: additional cloud storage.", tax: "GST 18%" },
      { name: "Priority Support", type: "ADDON", price: 800, cost: 200, notes: "Add-on: 4-hour response time.", tax: "GST 18%" },
      { name: "Extra User Seat", type: "ADDON", price: 250, cost: 50, notes: "Add-on: one more user.", tax: "GST 18%", perSeat: true },
    ],
    extra: { name: "Training Hours", type: "SERVICE", price: 600, cost: 300, notes: "Live training sessions.", tax: "GST 5%" },
    plans: {
      monthly: { name: "Monthly", price: 999, period: "MONTHLY" },
      yearly: { name: "Yearly", price: 9999, period: "YEARLY", pausable: false },
      yearlyFixed: { name: "Yearly Contract (fixed term)", price: 8999, period: "YEARLY", autoClose: true, closable: false, pausable: false, renewable: true, minQuantity: 5 },
      weekly: { name: "Weekly", price: 299, period: "WEEKLY" },
      daily: { name: "Daily Pay-as-you-go", price: 49, period: "DAILY", renewable: false },
    },
    templates: [
      { name: "Starter (Monthly)", plan: "monthly", validityDays: 15, note: "Everything a small business needs to get started.", lines: [{ product: 0, variant: 0, quantity: 3 }, { product: 0, addon: true, quantity: 1 }] },
      { name: "Enterprise (Yearly)", plan: "yearly", validityDays: 30, note: "Full suite for large teams on a yearly contract.", lines: [{ product: 0, variant: 1, quantity: 25 }, { product: 1, variant: 1, quantity: 10 }, { product: 2, quantity: 25 }, { product: 1, addon: true, quantity: 1 }] },
    ],
  },
  {
    name: "Nimbus Fitness",
    email: "accounts@nimbusfitness.test",
    phone: "+91 80 4000 2222",
    address: "12 Residency Road\nBengaluru, Karnataka 560025",
    domain: "nimbusfitness.test",
    admin: "Nikhil Owner",
    staff: "Fatima Frontdesk",
    customer: { name: "Rahul Menon", company: "" },
    subscriptions: Math.max(50, Math.round(SUBSCRIPTIONS / 6)),
    main: [
      { name: "Gym Membership", type: "SERVICE", price: 1500, cost: 400, notes: "Full gym access.", tax: "GST 18%", attribute: { name: "Branch", values: [["Indiranagar", 0], ["Whitefield", 300]] } },
      { name: "Yoga Classes", type: "SERVICE", price: 1200, cost: 350, notes: "Unlimited group yoga.", tax: "GST 18%" },
    ],
    addons: [
      { name: "Locker", type: "ADDON", price: 200, cost: 20, notes: "Add-on: personal locker.", tax: "GST 18%" },
      { name: "Diet Plan", type: "ADDON", price: 500, cost: 100, notes: "Add-on: monthly nutritionist plan.", tax: "GST 18%" },
      { name: "Guest Pass", type: "ADDON", price: 150, cost: 10, notes: "Add-on: bring a friend.", tax: "GST 18%", perSeat: true },
    ],
    extra: { name: "Personal Training Session", type: "SERVICE", price: 800, cost: 400, notes: "One-to-one session with a trainer.", tax: "GST 18%" },
    plans: {
      monthly: { name: "Monthly Membership", price: 0, period: "MONTHLY" },
      yearly: { name: "Annual Membership", price: 0, period: "YEARLY", pausable: true },
      yearlyFixed: { name: "Annual (locked-in)", price: 0, period: "YEARLY", autoClose: true, closable: false, pausable: false },
      weekly: { name: "Weekly Pass", price: 0, period: "WEEKLY" },
      daily: { name: "Day Pass", price: 0, period: "DAILY", renewable: false },
    },
    templates: [{ name: "New member (Monthly)", plan: "monthly", validityDays: 7, note: "Gym membership with a locker.", lines: [{ product: 0, variant: 0, quantity: 1 }, { product: 0, addon: true, quantity: 1 }] }],
  },
];

async function main() {
  // The seed wipes every table. Only allow it on a local database unless forced.
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) && process.env.SEED_FORCE !== "1") {
    throw new Error("Refusing to seed: DATABASE_URL is not a local database and the seed deletes all data. Set SEED_FORCE=1 to override.");
  }
  const t0 = Date.now();
  console.log("Wiping database…");
  await wipe();
  const logins: string[] = [];
  for (const spec of COMPANIES) logins.push(...(await seedCompany(spec)));
  console.log(`\n✅ Seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const l of logins) console.log(l);
}

async function seedCompany(spec: CompanySpec): Promise<string[]> {
  const SUBSCRIPTIONS = spec.subscriptions;
  console.log(`\n${spec.name}`);
  const hash = (p: string) => bcrypt.hash(p, 10);

  // Registering the company creates its admin and default taxes, payment terms and close reasons.
  const { org, admin, db } = await setUpCompany({
    companyName: spec.name,
    ownerName: spec.admin,
    ownerEmail: `admin@${spec.domain}`,
    passwordHash: await hash("Admin@1234"),
  });
  await db.organization.update({ where: { id: org.id }, data: { email: spec.email, phone: spec.phone, address: spec.address } });

  // ───────────── Users ─────────────
  const staff = await db.user.create({ data: { email: `staff@${spec.domain}`, name: spec.staff, role: "STAFF", passwordHash: await hash("Staff@1234") } });
  const portalUser = await db.user.create({ data: { email: `customer@${spec.domain}`, name: spec.customer.name, role: "CUSTOMER", passwordHash: await hash("Customer@123") } });

  // ───────────── Settings data (created by setUpCompany) ─────────────
  const taxByName = Object.fromEntries((await db.tax.findMany()).map((t) => [t.name, t]));
  const gst18 = taxByName["GST 18%"];
  const termByDays = Object.fromEntries((await db.paymentTerm.findMany()).map((t) => [t.dueDays, t]));
  const [immediate, net15, net30] = [termByDays[0], termByDays[15], termByDays[30]];
  const reasons = await db.closeReason.findMany({ orderBy: { name: "asc" } });

  // ───────────── Products & variants ─────────────
  async function product(p: ProductSpec) {
    const tax = taxByName[p.tax].id;
    const prod = await db.product.create({
      data: { name: p.name, type: p.type, salesPrice: p.price * 100, costPrice: p.cost * 100, notes: p.notes, taxes: { connect: [{ id: tax }] } },
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
    return { ...prod, variants, tax, perSeat: Boolean(p.perSeat) };
  }

  type SeededProduct = Awaited<ReturnType<typeof product>>;
  const mainProducts: SeededProduct[] = [];
  for (const p of spec.main) mainProducts.push(await product(p));
  const addons: SeededProduct[] = [];
  for (const p of spec.addons) addons.push(await product(p));
  const training = await product(spec.extra);

  // ───────────── Plans ─────────────
  const year = new Date().getFullYear();
  const plan = (data: PlanSpec) => db.recurringPlan.create({ data: { ...data, price: data.price * 100, startDate: new Date(year - 2, 0, 1) } });
  const monthly = await plan(spec.plans.monthly);
  const yearly = await plan(spec.plans.yearly);
  const yearlyFixed = await plan(spec.plans.yearlyFixed);
  const weekly = await plan(spec.plans.weekly);
  const daily = await plan(spec.plans.daily);

  // ───────────── Quotation templates ─────────────
  for (const t of spec.templates) {
    await db.quotationTemplate.create({
      data: {
        name: t.name,
        planId: (t.plan === "monthly" ? monthly : yearly).id,
        validityDays: t.validityDays,
        paymentTermId: (t.plan === "monthly" ? immediate : net30).id,
        note: t.note,
        lines: {
          create: t.lines.map((l) => {
            const p = l.addon ? addons[l.product] : mainProducts[l.product];
            return { productId: p.id, variantId: l.variant !== undefined ? p.variants[l.variant].id : null, quantity: l.quantity };
          }),
        },
      },
    });
  }

  // ───────────── Customers ─────────────
  const customerRows = Array.from({ length: Math.max(50, Math.round(SUBSCRIPTIONS / 3)) }, (_, i) => {
    const first = pick(FIRST);
    const last = pick(LAST);
    const company = `${last} ${pick(BIZ)}`;
    return {
      id: id(),
      name: i === 0 ? spec.customer.name : `${first} ${last}`,
      email: i === 0 ? `customer@${spec.domain}` : `${first}.${last}.${i}@${spec.domain.split(".")[0]}-customers.test`.toLowerCase(),
      company: i === 0 ? spec.customer.company : company,
      phone: `+91 9${between(100000000, 999999999)}`,
      address: `${between(1, 200)}, ${pick(["MG Road", "Market Street", "Park Avenue", "Station Road"])}\n${pick(CITIES)}, India`,
      userId: i === 0 ? portalUser.id : null,
    };
  });
  await db.customer.createMany({ data: customerRows });

  // ───────────── Subscriptions, invoices, payments ─────────────
  const today = startOfDay();
  const taxes = Object.fromEntries(Object.values(taxByName).map((t) => [t.id, t]));
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
    const isDemo = n < Math.min(3, mainProducts.length + 1);
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
    const mains = isDemo ? [mainProducts[n % mainProducts.length]] : [pick(mainProducts), ...(rand() < 0.3 ? [pick(mainProducts)] : [])];
    const lines: { productId: string | null; variantId: string | null; description: string; quantity: number; unitPrice: number; taxId: string }[] = [];
    if (thePlan.price > 0) lines.push({ productId: null, variantId: null, description: `${thePlan.name} plan`, quantity: 1, unitPrice: thePlan.price, taxId: gst18.id });
    for (const p of new Set(mains)) {
      const v = p.variants.length ? pick(p.variants) : null;
      const qty = Math.max(thePlan.minQuantity, thePlan.period === "YEARLY" ? between(5, 40) : between(1, 12));
      lines.push({ productId: p.id, variantId: v?.id ?? null, description: v ? `${p.name} (${v.name})` : p.name, quantity: qty, unitPrice: p.salesPrice + (v?.extra ?? 0), taxId: p.tax });
    }
    if (rand() < 0.45 || isDemo) {
      const a = pick(addons);
      lines.push({ productId: a.id, variantId: null, description: a.name, quantity: a.perSeat ? between(2, 15) : 1, unitPrice: a.salesPrice, taxId: a.tax });
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
        closeReasonId: closedAt ? pick(reasons.filter((r) => !["Contract ended", "Quotation expired"].includes(r.name))).id : null,
        untaxed: totals.subtotal,
        taxTotal: totals.taxAmount,
        total: totals.total,
        createdAt: new Date(Math.min(addDays(startDate, -between(1, 10)).getTime(), addDays(today, -between(0, 3)).getTime())),
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

  const chunk = async <T,>(rows: T[], fn: (batch: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 500) await fn(rows.slice(i, i + 500));
  };
  await chunk(invoiceRows, (b) => db.invoice.createMany({ data: b }));
  await chunk(invoiceLineRows, (b) => db.invoiceLine.createMany({ data: b }));
  await chunk(paymentRows, (b) => db.payment.createMany({ data: b }));
  await chunk(activityRows, (b) => db.activity.createMany({ data: b }));

  // ───────────── Discounts ─────────────
  await db.discount.create({
    data: { name: `Volume — 10% off 10+ ${spec.main[0].name.includes("Gym") ? "passes" : "seats"}`, type: "PERCENT", value: 10, scope: "PRODUCTS", minQuantity: 10, startDate: new Date(year, 0, 1), endDate: new Date(year + 1, 11, 31), products: { connect: [{ id: addons.find((a) => a.perSeat)!.id }, { id: mainProducts[0].id }] } },
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

  console.log(`  ${SUBSCRIPTIONS} subscriptions, ${invoiceRows.length} invoices, ${paymentRows.length} payments`);
  return [
    `\n   ${spec.name}`,
    `     Admin:    admin@${spec.domain} / Admin@1234`,
    `     Staff:    staff@${spec.domain} / Staff@1234`,
    `     Customer: customer@${spec.domain} / Customer@123`,
  ];
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => rootDb.$disconnect());
