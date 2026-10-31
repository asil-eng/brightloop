import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDiscounts, computeLine, discountIsValid, type DiscountRule } from "../src/lib/pricing";
import { addMonths, addPeriod } from "../src/lib/dates";
import { passwordProblems } from "../src/lib/password";

const gst18 = { name: "GST 18%", rate: 18, priceIncluded: false };
const incl18 = { name: "GST 18% incl", rate: 18, priceIncluded: true };

test("excluded tax is added on top", () => {
  assert.deepEqual(computeLine(100_00, 3, [gst18]), { subtotal: 300_00, taxAmount: 54_00, total: 354_00 });
});

test("included tax is extracted from the price", () => {
  assert.deepEqual(computeLine(118_00, 1, [incl18]), { subtotal: 100_00, taxAmount: 18_00, total: 118_00 });
});

test("line discount reduces the taxable base", () => {
  assert.deepEqual(computeLine(100_00, 1, [gst18], 10_00), { subtotal: 90_00, taxAmount: 16_20, total: 106_20 });
});

const rule = (o: Partial<DiscountRule>): DiscountRule => ({
  id: "d", name: "d", type: "PERCENT", value: 10, scope: "PRODUCTS", minPurchase: null, minQuantity: null,
  startDate: null, endDate: null, usageLimit: null, usedCount: 0, active: true, productIds: ["seat"], subscriptionIds: [], ...o,
});
const on = new Date(2026, 5, 15);

test("percentage product discount needs the minimum quantity", () => {
  const lines = [{ productId: "seat", unitPrice: 250_00, quantity: 12 }, { productId: "crm", unitPrice: 1200_00, quantity: 1 }];
  const r = applyDiscounts(lines, [rule({ minQuantity: 10 })], "s1", on);
  assert.deepEqual(r.perLine, [300_00, 0]);
  const none = applyDiscounts([{ ...lines[0], quantity: 5 }], [rule({ minQuantity: 10 })], "s1", on);
  assert.deepEqual(none.perLine, [0]);
});

test("fixed whole-subscription discount is spread across lines and capped", () => {
  const lines = [{ productId: "a", unitPrice: 300_00, quantity: 1 }, { productId: "b", unitPrice: 100_00, quantity: 1 }];
  const r = applyDiscounts(lines, [rule({ type: "FIXED", value: 100_00, scope: "SUBSCRIPTION", subscriptionIds: ["s1"] })], "s1", on);
  assert.deepEqual(r.perLine, [75_00, 25_00]);
  const other = applyDiscounts(lines, [rule({ type: "FIXED", value: 100_00, scope: "SUBSCRIPTION", subscriptionIds: ["s1"] })], "s2", on);
  assert.deepEqual(other.perLine, [0, 0]);
  const capped = applyDiscounts([{ productId: "a", unitPrice: 50_00, quantity: 1 }], [rule({ type: "FIXED", value: 100_00, scope: "SUBSCRIPTION" })], "s1", on);
  assert.deepEqual(capped.perLine, [50_00]);
});

test("discount stops when expired or used up", () => {
  assert.equal(discountIsValid(rule({ endDate: new Date(2026, 5, 14) }), on), false);
  assert.equal(discountIsValid(rule({ endDate: new Date(2026, 5, 15) }), on), true);
  assert.equal(discountIsValid(rule({ startDate: new Date(2026, 5, 16) }), on), false);
  assert.equal(discountIsValid(rule({ usageLimit: 3, usedCount: 3 }), on), false);
  assert.equal(discountIsValid(rule({ active: false }), on), false);
});

test("billing periods", () => {
  assert.equal(addMonths(new Date(2026, 0, 31), 1).getDate(), 28);
  assert.equal(addPeriod(new Date(2026, 0, 1), "WEEKLY").getDate(), 8);
  assert.equal(addPeriod(new Date(2026, 0, 1), "YEARLY").getFullYear(), 2027);
  assert.equal(addPeriod(new Date(2026, 0, 1), "DAILY", 3).getDate(), 4);
});

test("password rules from the brief", () => {
  assert.deepEqual(passwordProblems("Abcdefg!x"), []); // 9 chars
  assert.ok(passwordProblems("Abcdefg!").length > 0); // exactly 8 is not "more than eight"
  assert.ok(passwordProblems("abcdefgh!x").includes("contain an uppercase letter"));
  assert.ok(passwordProblems("ABCDEFGH!X").includes("contain a lowercase letter"));
  assert.ok(passwordProblems("Abcdefghij").includes("contain a special character"));
});
