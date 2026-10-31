import crypto from "node:crypto";

// A small client for the Razorpay REST API (test mode). Each company uses its own keys, so the
// money from its customers goes to its own Razorpay account.

export type RazorpayKeys = { keyId: string; keySecret: string };

const API = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {}

async function call<T>(keys: RazorpayKeys, path: string, init: { method?: string; body?: object } = {}): Promise<T> {
  const res = await fetch(API + path, {
    method: init.method ?? "GET",
    headers: {
      Authorization: "Basic " + Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = (data as { error?: { description?: string } }).error?.description ?? `HTTP ${res.status}`;
    throw new RazorpayError(reason);
  }
  return data as T;
}

/** Test-mode keys only: this prototype never takes real money. */
export const isTestKey = (keyId: string) => /^rzp_test_[A-Za-z0-9]+$/.test(keyId);

/** Check the keys work (an authenticated, read-only request). */
export async function checkKeys(keys: RazorpayKeys) {
  await call(keys, "/orders?count=1");
}

export type RazorpayOrder = { id: string; amount: number; currency: string; receipt: string; status: string; notes: Record<string, string> };

/** An order for the exact amount due, in paise, tagged with the invoice it pays. */
export function createOrder(keys: RazorpayKeys, o: { amount: number; receipt: string; notes: Record<string, string> }) {
  return call<RazorpayOrder>(keys, "/orders", { method: "POST", body: { amount: o.amount, currency: "INR", receipt: o.receipt.slice(0, 40), notes: o.notes } });
}

export const fetchOrder = (keys: RazorpayKeys, id: string) => call<RazorpayOrder>(keys, `/orders/${encodeURIComponent(id)}`);

export type RazorpayPayment = { id: string; order_id: string; amount: number; currency: string; status: string; method: string };

export const fetchPayment = (keys: RazorpayKeys, id: string) => call<RazorpayPayment>(keys, `/payments/${encodeURIComponent(id)}`);

export const capturePayment = (keys: RazorpayKeys, id: string, amount: number) =>
  call<RazorpayPayment>(keys, `/payments/${encodeURIComponent(id)}/capture`, { method: "POST", body: { amount, currency: "INR" } });

/** Checkout's success callback is only trusted if Razorpay's signature over order|payment matches. */
export function verifySignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
