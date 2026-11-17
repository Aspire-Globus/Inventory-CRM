import { useEffect, useMemo, useState } from 'react';
import { tw } from './tw.js';

/* ---------- Sorting ---------- */
const compare = (a, b) => {
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

export function useSort(rows, initial = { key: null, dir: 'asc' }) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const out = [...rows].sort((x, y) => compare(x[sort.key], y[sort.key]));
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, sort]);
  // Click: asc → desc → off
  const toggle = (key) =>
    setSort((s) => (s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }));
  return { sorted, sort, toggle };
}

export function SortTh({ label, field, sort, onSort, className = '' }) {
  const active = sort.key === field;
  return (
    <th className={`cursor-pointer select-none hover:!bg-[#E9ECE8] [&_.sort-arrow]:opacity-40 ${active ? '!text-brand [&_.sort-arrow]:!opacity-100' : ''} ${className}`} onClick={() => onSort(field)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {label}
      <span className="sort-arrow text-[10px] ml-1.5">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  );
}

/* ---------- Bulk selection ---------- */
export function useSelection(rows, isSelectable = () => true) {
  const [selected, setSelected] = useState(() => new Set());
  const selectable = useMemo(() => rows.filter(isSelectable).map((r) => r._id), [rows, isSelectable]);

  // Drop selections that are no longer visible (after filter / reload)
  useEffect(() => {
    setSelected((s) => {
      const keep = new Set([...s].filter((id) => selectable.includes(id)));
      return keep.size === s.size ? s : keep;
    });
  }, [selectable]);

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allChecked = selectable.length > 0 && selectable.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(selectable));
  const clear = () => setSelected(new Set());
  const selectedRows = rows.filter((r) => selected.has(r._id));

  return { selected, selectedRows, toggle, toggleAll, allChecked, someChecked: selected.size > 0 && !allChecked, clear };
}

export function CheckAll({ sel }) {
  return (
    <th className="w-10 !pr-0">
      <input
        type="checkbox"
        checked={sel.allChecked}
        ref={(el) => el && (el.indeterminate = sel.someChecked)}
        onChange={sel.toggleAll}
        aria-label="Select all"
      />
    </th>
  );
}

export function CheckCell({ sel, id, disabled }) {
  return (
    <td className="w-10 !pr-0" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={sel.selected.has(id)} onChange={() => sel.toggle(id)} disabled={disabled} aria-label="Select row" />
    </td>
  );
}

export function BulkBar({ sel, children }) {
  if (!sel.selected.size) return null;
  return (
    <div className="flex flex-wrap items-center gap-3.5 mb-3 px-3.5 py-2 rounded-lg bg-brand-soft border border-brand/25">
      <strong>{sel.selected.size} selected</strong>
      <div className="flex flex-wrap gap-2">{children}</div>
      <button className={tw.linkBtn} onClick={sel.clear}>Clear</button>
    </div>
  );
}

/* ---------- Pagination ---------- */
export const PAGE_SIZES = [10, 25, 50, 100];

export function usePagination(rows, initialSize = 25) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(initialSize);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  // Stay in range when rows shrink (filter, delete, reload)
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const current = Math.min(page, pages);
  const pageRows = useMemo(() => rows.slice((current - 1) * size, current * size), [rows, current, size]);
  const changeSize = (s) => {
    setSize(s);
    setPage(1);
  };
  return { pageRows, page: current, pages, size, total, setPage, setSize: changeSize };
}

const pageList = (page, pages) => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push('…' + n);
    out.push(n);
  });
  return out;
};

export function Pagination({ pg, label = 'rows' }) {
  if (!pg.total) return null;
  const from = (pg.page - 1) * pg.size + 1;
  const to = Math.min(pg.page * pg.size, pg.total);
  const btn = 'min-w-8 h-8 px-2 rounded-md border border-line bg-white text-[13px] font-medium cursor-pointer hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-line text-[13px] text-muted">
      <div className="flex items-center gap-2">
        <span>Showing <strong className="text-ink">{from}–{to}</strong> of <strong className="text-ink">{pg.total}</strong> {label}</span>
        <select
          className="h-8 px-2 rounded-md border border-line bg-white text-ink"
          value={pg.size}
          onChange={(e) => pg.setSize(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
      </div>
      {pg.pages > 1 && (
        <div className="flex items-center gap-1">
          <button className={btn} onClick={() => pg.setPage(pg.page - 1)} disabled={pg.page === 1} aria-label="Previous page">‹</button>
          {pageList(pg.page, pg.pages).map((n) =>
            typeof n === 'string' ? (
              <span key={n} className="px-1">…</span>
            ) : (
              <button key={n} className={`${btn} ${n === pg.page ? '!bg-brand !text-white !border-brand' : 'text-ink'}`} onClick={() => pg.setPage(n)} aria-current={n === pg.page ? 'page' : undefined}>
                {n}
              </button>
            )
          )}
          <button className={btn} onClick={() => pg.setPage(pg.page + 1)} disabled={pg.page === pg.pages} aria-label="Next page">›</button>
        </div>
      )}
    </div>
  );
}
