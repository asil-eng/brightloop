// Integration test of the billing engine against a throwaway SQLite database.
// Run with: npm test
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { rootDb, type Db } from "../src/lib/db";
import { setUpCompany } from "../src/lib/company";
import { addDays, startOfDay } from "../src/lib/dates";
import { cancelInvoice, confirmInvoice, invoiceNextPeriod, recomputeSubscription, registerPayment } from "../src/lib/billing";
import { activateSubscription, closeSubscription, confirmSubscription, pauseSubscription, resumeSubscription } from "../src/lib/subscriptions";
import { handleExpiry, runBilling } from "../src/lib/jobs";

console.log = () => {}; // silence dev-mode email output

const today = startOfDay();
let n = 0;

async function makeSubscription(o: { start?: Date; expiry?: Date | null; plan?: Partial<{ autoClose: boolean; closable: boolean; pausable: boolean; period: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" }>; qty?: number } = {}, c?: Db) {
  const db = c ?? defaultDb();
  const tax = await db.tax.create({ data: { name: "GST 18%", rate: 18 } });
  const product = await db.product.create({ data: { name: `Seat ${++n}`, salesPrice: 100_00, taxes: { connect: { id: tax.id } } } });
  const plan = await db.recurringPlan.create({ data: { name: `Plan ${n}`, period: o.plan?.period ?? "MONTHLY", autoClose: o.plan?.autoClose ?? false, closable: o.plan?.closable ?? true, pausable: o.plan?.pausable ?? true } });
  const customer = await db.customer.create({ data: { name: `Customer ${n}`, email: `c${n}@test.dev` } });
  const sub = await db.subscription.create({
    data: {
      number: `T/${n}`,
      customerId: customer.id,
      planId: plan.id,
      status: "QUOTATION",
      startDate: o.start ?? today,
      expiryDate: o.expiry ?? null,
      lines: { create: { productId: product.id, description: "Seat", quantity: o.qty ?? 2, unitPrice: 100_00, taxes: { connect: { id: tax.id } } } },
    },
  });
  await recomputeSubscription(db, sub.id);
  return { sub, product, plan };
}

let db: Db;
let otherDb: Db;
const defaultDb = () => db;

before(async () => {
  db = (await setUpCompany({ companyName: `Test Co ${Date.now()}`, ownerName: "Owner", ownerEmail: `owner${Date.now()}@test.dev`, passwordHash: null })).db;
  otherDb = (await setUpCompany({ companyName: `Other Co ${Date.now()}`, ownerName: "Owner", ownerEmail: `other${Date.now()}@test.dev`, passwordHash: null })).db;
});

test("confirming a subscription that starts today activates it and bills the first period", async () => {
  const { sub } = await makeSubscription();
  await confirmSubscription(db, sub.id, null);
  const s = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
  assert.equal(s.status, "ACTIVE");
  const invoices = await db.invoice.findMany({ where: { subscriptionId: sub.id } });
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].status, "CONFIRMED");
  assert.ok(invoices[0].number?.startsWith("INV/"));
  assert.equal(invoices[0].total, 236_00); // 2 × 100 + 18% GST
  assert.ok(invoices[0].sentAt, "invoice is emailed automatically");
  assert.ok(s.nextInvoiceDate! > today, "next invoice date moves forward");
});

test("a billing period is never invoiced twice", async () => {
  const { sub } = await makeSubscription({ start: addDays(today, -1) });
  await db.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", nextInvoiceDate: addDays(today, -1) } });
  const first = await invoiceNextPeriod(db, sub.id);
  assert.ok(first);
  // Force the next date back to the same period and try again.
  await db.subscription.update({ where: { id: sub.id }, data: { nextInvoiceDate: addDays(today, -1) } });
  const second = await invoiceNextPeriod(db, sub.id);
  assert.equal(second, null);
  assert.equal(await db.invoice.count({ where: { subscriptionId: sub.id } }), 1);
});

test("the billing run catches up on missed periods without skipping any", async () => {
  const { sub } = await makeSubscription({ start: addDays(today, -21), plan: { period: "WEEKLY" } });
  await db.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", nextInvoiceDate: addDays(today, -21) } });
  await runBilling(db);
  const invoices = await db.invoice.findMany({ where: { subscriptionId: sub.id }, orderBy: { periodStart: "asc" } });
  assert.equal(invoices.length, 4); // -21, -14, -7, today
  for (let i = 1; i < invoices.length; i++) {
    assert.equal(addDays(invoices[i - 1].periodEnd!, 1).getTime(), invoices[i].periodStart!.getTime(), "periods are contiguous");
  }
  await runBilling(db);
  assert.equal(await db.invoice.count({ where: { subscriptionId: sub.id } }), 4, "running again creates nothing new");
});

test("discounts apply automatically and stop at their usage limit", async () => {
  const { sub, product } = await makeSubscription({ qty: 12 });
  await db.discount.create({ data: { name: "10% for 10+", type: "PERCENT", value: 10, scope: "PRODUCTS", minQuantity: 10, usageLimit: 1, products: { connect: { id: product.id } } } });
  await db.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", nextInvoiceDate: today } });
  const firstId = await invoiceNextPeriod(db, sub.id);
  const first = await db.invoice.findUniqueOrThrow({ where: { id: firstId! } });
  assert.equal(first.discountTotal, 120_00); // 10% of 1,200
  assert.equal(first.untaxed, 1080_00);
  await db.subscription.update({ where: { id: sub.id }, data: { nextInvoiceDate: addDays(today, 40) } });
  const secondId = await invoiceNextPeriod(db, sub.id);
  const second = await db.invoice.findUniqueOrThrow({ where: { id: secondId! } });
  assert.equal(second.discountTotal, 0, "limit of 1 use reached");
});

test("payments: partial then full marks the invoice paid; overpayment is refused", async () => {
  const { sub } = await makeSubscription();
  await db.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", nextInvoiceDate: today } });
  const id = (await invoiceNextPeriod(db, sub.id))!;
  await confirmInvoice(db, id);
  await registerPayment(db, { invoiceId: id, amount: 100_00, method: "UPI", date: today, note: "part" });
  let inv = await db.invoice.findUniqueOrThrow({ where: { id } });
  assert.equal(inv.status, "CONFIRMED");
  assert.equal(inv.amountPaid, 100_00);
  await assert.rejects(registerPayment(db, { invoiceId: id, amount: 500_00, method: "CASH", date: today }), /more than what is due/);
  await registerPayment(db, { invoiceId: id, amount: 136_00, method: "BANK_TRANSFER", date: today });
  inv = await db.invoice.findUniqueOrThrow({ where: { id } });
  assert.equal(inv.status, "PAID");
  await assert.rejects(cancelInvoice(db, id), /cannot be cancelled/);
});

test("cancelling an invoice frees its period to be billed again", async () => {
  const { sub } = await makeSubscription();
  await db.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", nextInvoiceDate: today } });
  const id = (await invoiceNextPeriod(db, sub.id))!;
  await cancelInvoice(db, id);
  await db.subscription.update({ where: { id: sub.id }, data: { nextInvoiceDate: today } });
  assert.ok(await invoiceNextPeriod(db, sub.id));
});

test("pause stops billing; plan rules are enforced", async () => {
  const { sub } = await makeSubscription({ start: addDays(today, 5), plan: { pausable: false, closable: false } });
  await confirmSubscription(db, sub.id, null);
  assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status, "CONFIRMED");
  await activateSubscription(db, sub.id, null);
  await assert.rejects(pauseSubscription(db, sub.id, null), /doesn't allow pausing/);
  await assert.rejects(closeSubscription(db, sub.id, null), /can't be closed before the end/);

  const other = await makeSubscription();
  await confirmSubscription(db, other.sub.id, null);
  await pauseSubscription(db, other.sub.id, null);
  await db.subscription.update({ where: { id: other.sub.id }, data: { nextInvoiceDate: addDays(today, -1) } });
  const before = await db.invoice.count({ where: { subscriptionId: other.sub.id } });
  await runBilling(db);
  assert.equal(await db.invoice.count({ where: { subscriptionId: other.sub.id } }), before, "paused subscriptions are not billed");
  await resumeSubscription(db, other.sub.id, null);
  const s = await db.subscription.findUniqueOrThrow({ where: { id: other.sub.id } });
  assert.equal(s.status, "ACTIVE");
  assert.equal(s.nextInvoiceDate!.getTime(), today.getTime(), "billing restarts from today");
});

test("expired subscriptions close automatically or renew, per plan", async () => {
  const closing = await makeSubscription({ start: addDays(today, -60), expiry: addDays(today, -2), plan: { autoClose: true } });
  const renewing = await makeSubscription({ start: addDays(today, -60), expiry: addDays(today, -2), plan: { autoClose: false } });
  for (const x of [closing, renewing]) await db.subscription.update({ where: { id: x.sub.id }, data: { status: "ACTIVE", nextInvoiceDate: null } });
  await handleExpiry(db);
  assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: closing.sub.id } })).status, "CLOSED");
  const r = await db.subscription.findUniqueOrThrow({ where: { id: renewing.sub.id } });
  assert.equal(r.status, "ACTIVE");
  assert.ok(r.expiryDate! > today, "renewed for another term");
  assert.ok(r.nextInvoiceDate, "billing resumes");
});

test("companies cannot see or change each other's data", async () => {
  const { sub } = await makeSubscription();
  await confirmSubscription(db, sub.id, null);
  const invoice = await db.invoice.findFirstOrThrow({ where: { subscriptionId: sub.id } });

  // Reads by id, lists and totals from another company find nothing.
  assert.equal(await otherDb.subscription.findUnique({ where: { id: sub.id } }), null);
  assert.equal(await otherDb.invoice.findFirst({ where: { id: invoice.id } }), null);
  assert.equal(await otherDb.subscription.count({ where: { id: sub.id } }), 0);
  assert.equal((await otherDb.invoice.aggregate({ where: { id: invoice.id }, _sum: { total: true } }))._sum.total, null);

  // Writes from another company fail or change nothing.
  await assert.rejects(otherDb.subscription.update({ where: { id: sub.id }, data: { note: "hacked" } }));
  assert.equal((await otherDb.invoice.updateMany({ where: { id: invoice.id }, data: { amountPaid: 1 } })).count, 0);
  await assert.rejects(registerPayment(otherDb, { invoiceId: invoice.id, amount: 100, method: "CASH", date: today }));
  await assert.rejects(confirmSubscription(otherDb, sub.id, null));
  assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).note, "");

  // Each company has its own organization record and document numbers.
  assert.notEqual((await db.organization.findFirstOrThrow()).id, (await otherDb.organization.findFirstOrThrow()).id);
  const { sub: otherSub } = await makeSubscription({}, otherDb);
  await confirmSubscription(otherDb, otherSub.id, null);
  const otherInvoice = await otherDb.invoice.findFirstOrThrow({ where: { subscriptionId: otherSub.id } });
  assert.match(otherInvoice.number!, /\/00001$/, "numbering starts at 1 for every company");
});

test("records can't be created without a company", async () => {
  await assert.rejects(rootDb.customer.create({ data: { name: "Orphan", email: "orphan@test.dev" } }));
});
