import Link from "next/link";
import clsx from "clsx";
import { Search } from "lucide-react";
import { buttonClass } from "./ui";

export const PAGE_SIZE = 25;

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function pageOf(sp: Record<string, string | string[] | undefined>): number {
  const n = Number(param(sp, "page"));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Build a URL keeping the current query but overriding some keys. */
export function withQuery(base: string, sp: Record<string, string | string[] | undefined>, changes: Record<string, string | number | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) q.set(k, val);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") q.delete(k);
    else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

type Filter = { name: string; label: string; options: { value: string; label: string }[] };

/** GET search form: free text plus optional dropdown filters and date range. */
export function SearchBar({
  action,
  sp,
  placeholder = "Search…",
  filters = [],
  dateRange = false,
  search = true,
  extra,
  extraQuery,
}: {
  action: string;
  sp: Record<string, string | string[] | undefined>;
  placeholder?: string;
  filters?: Filter[];
  dateRange?: boolean;
  search?: boolean;
  extra?: React.ReactNode;
  /** Query string kept by the Reset link, e.g. "?tab=overdue". */
  extraQuery?: string;
}) {
  return (
    <form action={action} className="card mb-4 flex flex-wrap items-end gap-2 p-3">
      {search && (
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 text-ink-secondary/70" size={16} />
          <input name="q" defaultValue={param(sp, "q")} placeholder={placeholder} className="input pl-8" />
        </div>
      )}
      {filters.map((f) => (
        <select key={f.name} name={f.name} defaultValue={param(sp, f.name)} className="input w-auto" aria-label={f.label}>
          <option value="">{f.label}: All</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {dateRange && (
        <>
          <input type="date" name="from" defaultValue={param(sp, "from")} className="input w-auto" aria-label="From date" />
          <input type="date" name="to" defaultValue={param(sp, "to")} className="input w-auto" aria-label="To date" />
        </>
      )}
      {extra}
      <button className={buttonClass("primary")}>Apply</button>
      <Link href={action + (extraQuery ?? "")} className="rounded-md px-2 py-2 text-sm text-ink-secondary hover:text-ink">
        Reset
      </Link>
    </form>
  );
}

export function Pagination({ base, sp, page, total, pageSize = PAGE_SIZE }: { base: string; sp: Record<string, string | string[] | undefined>; page: number; total: number; pageSize?: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = (enabled: boolean) =>
    clsx("rounded-md border px-3 py-1.5 text-sm", enabled ? "border-rule bg-panel text-ink hover:bg-ground-muted" : "pointer-events-none border-rule/60 text-ink-secondary/40");
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-3 text-[13px] text-ink-secondary">
      <span>
        {from}–{to} of {total.toLocaleString("en-IN")}
      </span>
      <div className="flex gap-2">
        <Link className={btn(page > 1)} href={withQuery(base, sp, { page: page - 1 })}>
          Previous
        </Link>
        <Link className={btn(page < pages)} href={withQuery(base, sp, { page: page + 1 })}>
          Next
        </Link>
      </div>
    </div>
  );
}

/** Tabs that set a query parameter, e.g. view=list|kanban. */
export function QueryTabs({ base, sp, name, tabs }: { base: string; sp: Record<string, string | string[] | undefined>; name: string; tabs: { value: string; label: string }[] }) {
  const current = param(sp, name) || tabs[0].value;
  return (
    <div className="inline-flex rounded-md border border-rule bg-panel p-0.5 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={withQuery(base, sp, { [name]: t.value === tabs[0].value ? null : t.value, page: null })}
          aria-current={current === t.value ? "page" : undefined}
          className={clsx("rounded px-3 py-1", current === t.value ? "bg-accent text-on-accent" : "text-ink-secondary hover:bg-ground-muted hover:text-ink")}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
