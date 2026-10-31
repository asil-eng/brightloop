"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const links = [
  { href: "/portal", label: "Overview" },
  { href: "/portal/subscriptions", label: "Subscriptions" },
  { href: "/portal/invoices", label: "Invoices" },
  { href: "/portal/payments", label: "Payments" },
  { href: "/portal/profile", label: "Profile" },
];

export function PortalNav() {
  const path = usePathname();
  return (
    <nav className="flex min-w-0 gap-1 overflow-x-auto text-sm">
      {links.map((l) => {
        const active = l.href === "/portal" ? path === "/portal" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={clsx("whitespace-nowrap rounded-md px-3 py-1.5", active ? "bg-white/20 font-medium text-white" : "text-brand-100 hover:bg-white/10 hover:text-white")}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
