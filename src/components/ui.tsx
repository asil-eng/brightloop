import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

// ───────────── Buttons ─────────────

const variants = {
  primary: "bg-accent text-on-accent border-accent hover:bg-brand-700 hover:border-brand-700",
  secondary: "bg-panel text-ink border-rule hover:bg-ground-muted hover:border-ink-secondary/30",
  danger: "bg-panel text-red-700 border-red-200 hover:bg-red-50",
  // Kept for existing call sites (e.g. "Pay now"): the single accent colour is the blue.
  accent: "bg-accent text-on-accent border-accent hover:bg-brand-700 hover:border-brand-700",
};

type Variant = keyof typeof variants;

export function buttonClass(variant: Variant = "secondary", size: "sm" | "md" = "md") {
  return clsx(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium shadow-sm",
    "transition-[transform,background-color,border-color,box-shadow] duration-[var(--dp-motion-interaction)] ease-out",
    "hover:-translate-y-px hover:shadow active:translate-y-0 active:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
    size === "sm" ? "min-h-8 px-3 py-1 text-[13px]" : "min-h-10 px-4 py-2 text-[15px]",
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
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-[13px] text-ink-secondary">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {b.href ? (
                  <Link href={b.href} className="hover:text-accent">
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
        <h1 className="truncate font-display text-[28px] font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-rule/70 px-5 py-3.5">
          {title && <h2 className="font-display text-base font-semibold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="overflow-x-auto p-5">{children}</div>
    </section>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-secondary">{hint}</span>}
    </label>
  );
}

export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-secondary">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
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
      <p className="font-display font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-secondary">{children}</div>}
    </div>
  );
}

// ───────────── Status badges ─────────────

const badgeColors: Record<string, string> = {
  DRAFT: "bg-ground-muted text-ink-secondary",
  QUOTATION: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200",
  CONFIRMED: "bg-brand-100 text-brand-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAUSED: "bg-amber-100 text-amber-800",
  CLOSED: "bg-rule/70 text-ink-secondary",
  PAID: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-700",
  OVERDUE: "bg-red-100 text-red-700",
  PARTIAL: "bg-amber-100 text-amber-800",
  ADMIN: "bg-brand-100 text-brand-800",
  STAFF: "bg-ground-muted text-ink-secondary ring-1 ring-inset ring-rule",
  CUSTOMER: "bg-ground-muted text-ink-secondary",
};

export function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={clsx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", badgeColors[status] ?? "bg-ground-muted text-ink-secondary")}>
      {label ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

/** Odoo-style status bar: shows every stage with the current one highlighted. */
export function StatusBar({ stages, current }: { stages: string[]; current: string }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-rule bg-panel text-xs font-medium">
      {stages.map((s) => (
        <span
          key={s}
          aria-current={s === current ? "step" : undefined}
          className={clsx(
            "border-r border-rule px-3 py-1.5 last:border-r-0",
            s === current ? "bg-accent text-on-accent" : "text-ink-secondary",
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
    <Link href={href} className="flex min-w-28 flex-col rounded-lg border border-rule bg-panel px-3.5 py-2 text-sm shadow-sm transition-colors duration-[var(--dp-motion-interaction)] ease-out hover:border-brand-200 hover:bg-brand-50">
      <span className="font-display font-semibold text-ink">{value}</span>
      <span className="text-xs text-ink-secondary">{label}</span>
    </Link>
  );
}

export function StatCard({ label, value, hint, tone = "default", href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "danger" | "good"; href?: string }) {
  const body = (
    <div className={clsx("card h-full p-5", href && "transition-colors duration-[var(--dp-motion-interaction)] ease-out hover:border-brand-200")}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-secondary">{label}</p>
      <p className={clsx("mt-1.5 font-display text-[26px] font-bold leading-tight tracking-tight", tone === "danger" ? "text-red-700" : tone === "good" ? "text-emerald-700" : "text-ink")}>{value}</p>
      {hint && <p className="mt-1 text-[13px] text-ink-secondary">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
