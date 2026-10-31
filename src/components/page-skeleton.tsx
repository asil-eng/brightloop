/** Shown instantly while a page's data loads, so navigation never feels frozen. */
export function PageSkeleton() {
  return (
    <div className="animate-pulse motion-reduce:animate-none" role="status" aria-label="Loading">
      <div className="mb-2 h-3 w-24 rounded bg-rule/70" />
      <div className="mb-6 h-8 w-64 rounded bg-rule" />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-28 p-5">
            <div className="h-3 w-24 rounded bg-rule/70" />
            <div className="mt-3 h-6 w-32 rounded bg-rule" />
          </div>
        ))}
      </div>
      <div className="card p-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4 border-b border-rule/60 py-3 last:border-0">
            <div className="h-3 w-1/4 rounded bg-rule/70" />
            <div className="h-3 w-1/3 rounded bg-rule/50" />
            <div className="ml-auto h-3 w-16 rounded bg-rule/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
