import Link from "next/link";
import { FlowDiagram } from "./diagram";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-ground lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden flex-col justify-between gap-10 bg-field p-10 text-on-field lg:flex xl:p-14">
        <Link href="/" className="font-display text-xl font-bold tracking-tight text-on-field">
          brightloop
        </Link>
        <div className="max-w-xl">
          <h2 className="font-display text-[34px] font-bold leading-[1.1] tracking-tight">Run your subscription business in one place.</h2>
          <ul className="mt-5 grid gap-x-6 gap-y-2 text-base text-on-field-secondary xl:grid-cols-2">
            <li>• Products, plans, quotations and subscriptions</li>
            <li>• Invoices created and emailed automatically on billing day</li>
            <li>• Taxes, discounts, payments and revenue reports</li>
            <li>• A portal where your customers see and pay their invoices</li>
          </ul>
          <div className="mt-10">
            <FlowDiagram />
          </div>
        </div>
        <p className="text-[13px] text-on-field-secondary">© Brightloop</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
