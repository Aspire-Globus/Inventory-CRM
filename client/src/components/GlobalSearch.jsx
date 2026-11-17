import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from './Icons.jsx';
import { tw } from './tw.js';

const ICON = { employees: 'users', items: 'box', assignments: 'clipboard', repairs: 'wrench', departments: 'building', categories: 'dashboard', users: 'users' };
const BADGE = {
  Inactive: 'bg-[#EBEEEA] text-muted', Assigned: 'bg-brand-soft text-brand', Returned: 'bg-[#EBEEEA] text-muted', Transferred: 'bg-[#EFEDFF] text-[#5B4BC4]',
  Damaged: 'bg-warn-soft text-warn', 'In repair': 'bg-[#E6EEFB] text-[#1D4ED8]', Repaired: 'bg-ok-soft text-ok', Scrapped: 'bg-danger-soft text-danger', Lost: 'bg-danger-soft text-danger',
};

// Highlight the typed text inside a result
function Mark({ text, q }) {
  if (!q || !text) return text || null;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="bg-[#FFF1B8] text-inherit rounded-sm">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** Top-bar search: finds employees, items, assignments, repairs, departments, categories, users */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const input = useRef(null);

  // Search 250 ms after typing stops; ignore answers to older text
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setData(null); setLoading(false); return; }
    setLoading(true);
    let stale = false;
    const t = setTimeout(() => {
      api.search(text)
        .then((d) => { if (!stale) { setData(d); setActive(0); } })
        .catch(() => { if (!stale) setData({ groups: [], total: 0, error: true }); })
        .finally(() => { if (!stale) setLoading(false); });
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [q]);

  // Close when clicking outside; Ctrl+K or "/" focuses the box
  useEffect(() => {
    const click = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const key = (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName || '');
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, []);

  const flat = (data?.groups || []).flatMap((g) => g.results.map((r) => ({ ...r, type: g.type })));
  const go = (link) => { setOpen(false); setQ(''); input.current?.blur(); navigate(link); };

  const onKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); input.current?.blur(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = q.trim();
      if (/^emp-?\d+$/i.test(v)) return go(`/employees/${v.toUpperCase()}`); // exact employee ID
      if (flat[active]) go(flat[active].link);
    }
  };

  const text = q.trim();
  let n = -1; // running index across groups (for keyboard highlight)

  return (
    <div ref={box} className="relative max-md:flex-1 max-md:min-w-0">
      <div className={`${tw.search} max-md:w-auto md:!w-[360px]`}>
        <Icon name="search" size={17} />
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search anything… (employee, item, vendor, ID)"
          aria-label="Search everything"
          role="combobox"
          aria-expanded={open && text.length >= 2}
          aria-controls="global-search-results"
        />
        {q ? (
          <button type="button" aria-label="Clear search" className="bg-transparent border-0 p-1 text-muted cursor-pointer" onClick={() => { setQ(''); input.current?.focus(); }}>
            <Icon name="x" size={15} />
          </button>
        ) : (
          <kbd className="max-md:hidden px-1.5 rounded border border-line text-[11px] text-muted font-sans">Ctrl K</kbd>
        )}
      </div>

      {open && text.length >= 2 && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute right-0 md:left-0 top-[calc(100%+6px)] z-50 w-[min(560px,calc(100vw-24px))] max-h-[70vh] overflow-y-auto bg-white border border-line rounded-xl shadow-[0_16px_40px_rgba(20,48,44,.18)] py-2"
        >
          {loading && !data && <div className="px-4 py-6 text-center text-[13px] text-muted">Searching…</div>}
          {data && !data.total && !loading && (
            <div className="px-4 py-6 text-center text-[13px] text-muted">{data.error ? 'Search failed — is the server running?' : <>Nothing found for “{text}”.</>}</div>
          )}
          {data?.groups.map((g) => (
            <div key={g.type} className="py-1">
              <div className="flex justify-between items-center px-4 pt-1.5 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                <span>{g.label} <span className="font-normal normal-case">({g.total})</span></span>
                {g.total > g.results.length && (
                  <button type="button" className="bg-transparent border-0 p-0 text-[12px] normal-case font-medium text-brand cursor-pointer hover:underline" onClick={() => go(g.more)}>
                    See all {g.total} →
                  </button>
                )}
              </div>
              {g.results.map((r) => {
                n += 1;
                const i = n;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="option"
                    aria-selected={active === i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r.link)}
                    className={`w-full flex items-center gap-3 px-4 py-2 border-0 text-left cursor-pointer ${active === i ? 'bg-[#E6F2EF]' : 'bg-transparent'}`}
                  >
                    <span className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-paper text-brand"><Icon name={ICON[g.type] || 'search'} size={16} /></span>
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[14px] font-medium truncate"><Mark text={r.title} q={text} /></span>
                      {r.subtitle && <span className="text-[12.5px] text-muted truncate"><Mark text={r.subtitle} q={text} /></span>}
                    </span>
                    {r.badge && <span className={`shrink-0 px-2 py-0.5 rounded-md text-[11.5px] font-semibold ${BADGE[r.badge] || 'bg-paper text-muted'}`}>{r.badge}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {data?.total > 0 && (
            <div className="px-4 pt-2 mt-1 border-t border-line text-[11.5px] text-muted">↑ ↓ to move · Enter to open · Esc to close</div>
          )}
        </div>
      )}
    </div>
  );
}
