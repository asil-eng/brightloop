"use client";

import { useState } from "react";
import clsx from "clsx";
import { ActionForm, SubmitButton } from "@/components/form";
import { payOnline } from "../../../actions";

export function Checkout({ invoiceId, amount }: { invoiceId: string; amount: string }) {
  const [method, setMethod] = useState<"CARD" | "UPI">("CARD");
  return (
    <ActionForm action={payOnline} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="method" value={method} />
      <div className="grid grid-cols-2 gap-2">
        {(["CARD", "UPI"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={clsx("rounded-md border px-3 py-2 text-sm font-medium", method === m ? "border-brand-600 bg-brand-50 text-brand-700" : "border-zinc-300 bg-white text-zinc-600")}
          >
            {m === "CARD" ? "💳 Card" : "📱 UPI"}
          </button>
        ))}
      </div>
      {method === "CARD" ? (
        <>
          <div>
            <label className="label" htmlFor="card">Card number</label>
            <input id="card" name="card" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" className="input font-mono" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="expiry">Expiry</label>
              <input id="expiry" name="expiry" placeholder="MM/YY" autoComplete="cc-exp" className="input font-mono" required />
            </div>
            <div>
              <label className="label" htmlFor="cvc">CVC</label>
              <input id="cvc" name="cvc" inputMode="numeric" placeholder="123" autoComplete="cc-csc" className="input font-mono" required />
            </div>
          </div>
        </>
      ) : (
        <div>
          <label className="label" htmlFor="vpa">UPI ID</label>
          <input id="vpa" name="vpa" placeholder="yourname@okbank" className="input" required />
        </div>
      )}
      <SubmitButton variant="accent" className="w-full">Pay {amount}</SubmitButton>
    </ActionForm>
  );
}
