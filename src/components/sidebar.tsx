"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import {
  BadgePercent,
  BarChart3,
  CreditCard,
  FileText,
  LayoutDashboard,
  Layers,
  Menu,
  Package,
  Receipt,
  RefreshCcw,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean };

const groups: { title: string; items: Item[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/app", label: "Dashboard", icon: LayoutDashboard },
      { href: "/app/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/app/subscriptions", label: "Subscriptions", icon: RefreshCcw },
      { href: "/app/customers", label: "Customers", icon: Users },
      { href: "/app/templates", label: "Quotation templates", icon: FileText },
    ],
  },
  {
    title: "Accounting",
    items: [
      { href: "/app/invoices", label: "Invoices", icon: Receipt },
      { href: "/app/payments", label: "Payments", icon: CreditCard },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { href: "/app/products", label: "Products", icon: Package },
      { href: "/app/plans", label: "Recurring plans", icon: Layers },
      { href: "/app/discounts", label: "Discounts", icon: BadgePercent, adminOnly: true },
    ],
  },
  {
    title: "Configuration",
    items: [{ href: "/app/settings", label: "Settings", icon: Settings, adminOnly: true }],
  },
];

export function Sidebar({ isAdmin, user, company, logout }: { isAdmin: boolean; user: { name: string; role: string }; company: string; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => {
        const items = g.items.filter((i) => !i.adminOnly || isAdmin);
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-on-field-secondary/70">{g.title}</p>
            {items.map((i) => {
              const active = i.href === "/app" ? pathname === "/app" : pathname.startsWith(i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-[var(--dp-motion-interaction)] ease-out",
                    active ? "bg-accent font-medium text-on-accent" : "text-on-field-secondary hover:bg-white/10 hover:text-on-field",
                  )}
                >
                  <i.icon size={16} />
                  {i.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 p-3">
      <p className="truncate text-sm font-medium text-on-field">{user.name}</p>
      <p className="text-xs text-on-field-secondary">{user.role === "ADMIN" ? "Administrator" : "Internal staff"}</p>
      <form action={logout} className="mt-2">
        <button className="text-xs text-on-field-secondary hover:text-on-field hover:underline">Log out</button>
      </form>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="no-print sticky top-0 z-30 flex items-center justify-between bg-field px-4 py-3 text-on-field lg:hidden">
        <span className="truncate font-display font-bold">{company}</span>
        <button onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div className="no-print fixed inset-0 z-20 flex flex-col bg-field pt-12 lg:hidden">
          {nav}
          {footer}
        </div>
      )}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-field lg:flex">
        <Link href="/app" className="px-5 py-4">
          <span className="block truncate font-display text-lg font-bold tracking-tight text-on-field">{company}</span>
          <span className="text-[11px] uppercase tracking-wider text-on-field-secondary/70">on brightloop</span>
        </Link>
        {nav}
        {footer}
      </aside>
    </>
  );
}
