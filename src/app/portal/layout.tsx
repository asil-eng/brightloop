import { requireCustomer } from "@/lib/auth";
import { logoutAction } from "../(auth)/actions";
import { PortalNav } from "./nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  return (
    <div className="min-h-screen">
      <header className="no-print bg-brand-600">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex w-full min-w-0 items-center gap-6 sm:w-auto">
            <span className="truncate text-lg font-bold text-white">{user.org.name}</span>
            <PortalNav />
          </div>
          <div className="flex items-center gap-3 text-sm text-brand-100">
            <span>{user.customer.name}</span>
            <form action={logoutAction}>
              <button className="rounded-md border border-white/30 px-2.5 py-1 text-white hover:bg-white/10">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
