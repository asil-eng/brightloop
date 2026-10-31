"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";
import { confirmRazorpayPayment, startRazorpayPayment } from "../../../actions";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load Razorpay. Check your connection."));
    document.body.appendChild(s);
  });
}

/** Opens Razorpay's own checkout for this invoice; the server verifies the result before recording it. */
export function RazorpayCheckout({ invoiceId, amount }: { invoiceId: string; amount: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    setBusy(true);
    setError("");
    try {
      await loadScript();
      const r = await startRazorpayPayment(invoiceId);
      if (!("ok" in r)) throw new Error(r.error);
      const rzp = new window.Razorpay!({
        key: r.keyId,
        order_id: r.orderId,
        amount: r.amount,
        currency: "INR",
        name: r.company,
        description: r.description,
        prefill: r.prefill,
        theme: { color: "#074ce0" },
        handler: async (res: RazorpayResponse) => {
          const out = await confirmRazorpayPayment({ invoiceId, orderId: res.razorpay_order_id, paymentId: res.razorpay_payment_id, signature: res.razorpay_signature });
          if (out?.error) { setError(out.error); setBusy(false); }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", (e) => setError(e.error?.description ?? "The payment failed. Please try again."));
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the payment.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <button type="button" onClick={pay} disabled={busy} className={`${buttonClass("primary")} w-full`}>
        {busy ? "Opening Razorpay…" : `Pay ${amount} with Razorpay`}
      </button>
      <p className="text-[13px] text-ink-secondary">Card, UPI or netbanking, through Razorpay&apos;s secure checkout.</p>
    </div>
  );
}
