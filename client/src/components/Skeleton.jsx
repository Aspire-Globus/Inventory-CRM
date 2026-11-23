/* Skeleton loading: grey shimmering blocks in the shape of the page, shown while data loads
   (instead of the plain "Loading…" text). */

// One grey bar / block. Pass Tailwind width / height classes, e.g. <Bone className="h-4 w-32" />
export function Bone({ className = '' }) {
  return <span className={`block rounded-md bg-[#E4E9E6] animate-pulse ${className}`} />;
}

const widths = ['w-24', 'w-40', 'w-28', 'w-16', 'w-32', 'w-20', 'w-12', 'w-36'];

/** Table rows (lists: inventory, employees, assignments, users, notifications…) */
export function TableSkeleton({ rows = 8, cols = 6 }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading">
      <div className="flex gap-6 px-4 py-3 border-b border-line bg-paper/60">
        {Array.from({ length: cols }, (_, c) => <Bone key={c} className={`h-3 ${widths[(c + 3) % widths.length]} opacity-70`} />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-4 border-b border-line last:border-0">
          {Array.from({ length: cols }, (_, c) =>
            c === 0 ? (
              <span key={c} className="flex items-center gap-3 min-w-[160px]">
                <Bone className="h-9 w-9 rounded-lg shrink-0" />
                <span className="flex flex-col gap-1.5">
                  <Bone className={`h-3.5 ${widths[(r + c) % widths.length]}`} />
                  <Bone className="h-2.5 w-16 opacity-70" />
                </span>
              </span>
            ) : (
              <Bone key={c} className={`h-3.5 ${widths[(r * 3 + c) % widths.length]} ${c === cols - 1 ? 'ml-auto' : ''}`} />
            )
          )}
        </div>
      ))}
    </div>
  );
}

/** Card grid (departments, category cards, dashboard tiles) */
export function CardsSkeleton({ count = 6, min = 260 }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-4 p-5 bg-white border border-line rounded-xl shadow-panel">
          <div className="flex items-center gap-3">
            <Bone className="h-[42px] w-[42px] rounded-lg" />
            <Bone className={`h-4 ${widths[i % widths.length]}`} />
          </div>
          <div className="flex gap-6 pt-3 border-t border-line">
            <Bone className="h-4 w-24" />
            <Bone className="h-4 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Small stacked lines (side panels, history timelines, board columns) */
export function ListSkeleton({ rows = 3 }) {
  return (
    <div className="flex flex-col gap-3 py-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 p-3 bg-white/70 border border-line rounded-xl">
          <Bone className={`h-3.5 ${widths[i % widths.length]}`} />
          <Bone className="h-2.5 w-3/4 opacity-70" />
        </div>
      ))}
    </div>
  );
}

/** Whole page: stat tiles + a table (dashboard, reports, employee page, first app load) */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <Bone className="h-7 w-52" />
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5 p-4 bg-white border border-line rounded-xl shadow-panel">
            <Bone className="h-3 w-24" />
            <Bone className="h-7 w-16" />
            <Bone className="h-2.5 w-28 opacity-70" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-line rounded-xl shadow-panel overflow-hidden">
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}
