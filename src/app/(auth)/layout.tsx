import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-brand-600 p-10 text-white lg:flex">
        <Link href="/" className="text-xl font-bold tracking-tight">
          brightloop
        </Link>
        <div>
          <h2 className="text-3xl font-semibold leading-tight">Plans, subscriptions and recurring billing in one place.</h2>
          <ul className="mt-6 space-y-2 text-brand-100">
            <li>• Invoices created and sent automatically on billing day</li>
            <li>• Taxes and discounts applied for you</li>
            <li>• See and pay your invoices online, any time</li>
          </ul>
        </div>
        <p className="text-sm text-brand-200">© Brightloop Software</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
