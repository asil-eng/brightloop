import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { isTestKey, verifySignature } from "../src/lib/razorpay";

test("Razorpay checkout results are only trusted with a valid signature", () => {
  const secret = "test_secret_123";
  const good = crypto.createHmac("sha256", secret).update("order_A|pay_B").digest("hex");
  assert.equal(verifySignature("order_A", "pay_B", good, secret), true);
  assert.equal(verifySignature("order_A", "pay_C", good, secret), false, "a different payment id");
  assert.equal(verifySignature("order_A", "pay_B", good, "other_secret"), false, "a different secret");
  assert.equal(verifySignature("order_A", "pay_B", "short", secret), false, "malformed signature");
});

test("only test-mode keys are accepted", () => {
  assert.equal(isTestKey("rzp_test_AbC123"), true);
  assert.equal(isTestKey("rzp_live_AbC123"), false);
  assert.equal(isTestKey("rzp_test_"), false);
});
