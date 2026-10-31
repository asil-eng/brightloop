import { requireCustomer } from "@/lib/auth";
import { logoutAction } from "../(auth)/actions";
import { PortalNav } from "./nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  return (
    <div className="min-h-screen">
      <header className="no-print bg-field">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex w-full min-w-0 flex-col items-start gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-6">
            <span className="max-w-full truncate font-display text-lg font-bold tracking-tight text-on-field">{user.org.name}</span>
            <PortalNav />
          </div>
          <div className="flex items-center gap-3 text-sm text-on-field-secondary">
            <span>{user.customer.name}</span>
            <form action={logoutAction}>
              <button className="rounded-md border border-white/25 px-2.5 py-1 text-on-field transition-colors duration-[var(--dp-motion-interaction)] ease-out hover:bg-white/10">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
