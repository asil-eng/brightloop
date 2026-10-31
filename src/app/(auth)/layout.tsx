import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-brand-600 p-10 text-white lg:flex">
        <Link href="/" className="text-xl font-bold tracking-tight">
          brightloop
        </Link>
        <div>
          <h2 className="text-3xl font-semibold leading-tight">Run your subscription business in one place.</h2>
          <ul className="mt-6 space-y-2 text-brand-100">
            <li>• Products, plans, quotations and subscriptions</li>
            <li>• Invoices created and emailed automatically on billing day</li>
            <li>• Taxes, discounts, payments and revenue reports</li>
            <li>• A portal where your customers see and pay their invoices</li>
          </ul>
        </div>
        <p className="text-sm text-brand-200">© Brightloop</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
