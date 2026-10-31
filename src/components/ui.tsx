import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

// ───────────── Buttons ─────────────

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 border-brand-600",
  secondary: "bg-white text-zinc-700 hover:bg-zinc-50 border-zinc-300",
  danger: "bg-white text-red-600 hover:bg-red-50 border-red-200",
  accent: "bg-accent-500 text-white hover:bg-accent-600 border-accent-500",
};

type Variant = keyof typeof variants;

export function buttonClass(variant: Variant = "secondary", size: "sm" | "md" = "md") {
  return clsx(
    "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
    variants[variant],
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button className={clsx(buttonClass(variant, size), className)} {...props} />;
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  children,
  className,
  ...rest
}: { href: string; variant?: Variant; size?: "sm" | "md"; children: ReactNode; className?: string; target?: string }) {
  return (
    <Link href={href} className={clsx(buttonClass(variant, size), className)} {...rest}>
      {children}
    </Link>
  );
}

// ───────────── Layout pieces ─────────────

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {breadcrumbs && (
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-xs text-zinc-500">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {b.href ? (
                  <Link href={b.href} className="hover:text-brand-600">
                    {b.label}
                  </Link>
                ) : (
                  b.label
                )}
                {i < breadcrumbs.length - 1 && <span>/</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-2xl font-semibold text-zinc-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="overflow-x-auto p-4">{children}</div>
    </section>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-900">{children}</dd>
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const cls = {
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  }[kind];
  return <div className={clsx("rounded-md border px-3 py-2 text-sm", cls)}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="font-medium text-zinc-700">{title}</p>
      {children && <div className="mt-1 text-sm text-zinc-500">{children}</div>}
    </div>
  );
}

// ───────────── Status badges ─────────────

const badgeColors: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  QUOTATION: "bg-sky-100 text-sky-800",
  CONFIRMED: "bg-indigo-100 text-indigo-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAUSED: "bg-amber-100 text-amber-800",
  CLOSED: "bg-zinc-200 text-zinc-700",
  PAID: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-700",
  OVERDUE: "bg-red-100 text-red-700",
  PARTIAL: "bg-amber-100 text-amber-800",
  ADMIN: "bg-brand-100 text-brand-800",
  STAFF: "bg-sky-100 text-sky-800",
  CUSTOMER: "bg-zinc-100 text-zinc-700",
};

export function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", badgeColors[status] ?? "bg-zinc-100 text-zinc-700")}>
      {label ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

/** Odoo-style status bar: shows every stage with the current one highlighted. */
export function StatusBar({ stages, current }: { stages: string[]; current: string }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-zinc-300 text-xs font-medium">
      {stages.map((s) => (
        <span
          key={s}
          className={clsx(
            "border-r border-zinc-300 px-3 py-1.5 last:border-r-0",
            s === current ? "bg-brand-600 text-white" : "bg-white text-zinc-500",
          )}
        >
          {s.charAt(0) + s.slice(1).toLowerCase()}
        </span>
      ))}
    </div>
  );
}

/** Small stat link shown on records, like Odoo's smart buttons. */
export function SmartButton({ href, label, value }: { href: string; label: string; value: ReactNode }) {
  return (
    <Link href={href} className="flex min-w-28 flex-col rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-brand-200 hover:bg-brand-50">
      <span className="font-semibold text-zinc-900">{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </Link>
  );
}

export function StatCard({ label, value, hint, tone = "default", href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "danger" | "good"; href?: string }) {
  const body = (
    <div className="card h-full p-4 transition hover:border-brand-200">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={clsx("mt-1 text-2xl font-semibold", tone === "danger" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-zinc-900")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
