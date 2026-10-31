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
    <nav className="flex w-full min-w-0 gap-1 overflow-x-auto text-sm sm:w-auto">
      {links.map((l) => {
        const active = l.href === "/portal" ? path === "/portal" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "whitespace-nowrap rounded-md px-3 py-1.5 transition-colors duration-[var(--dp-motion-interaction)] ease-out",
              active ? "bg-accent font-medium text-on-accent" : "text-on-field-secondary hover:bg-white/10 hover:text-on-field",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
