import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icons.jsx';

/**
 * A dropdown you can type into to filter (for long lists: employees, items).
 * options: [{ value, label, sub?, disabled? }]  — label is shown and searched; sub is a second grey line (also searched);
 *          disabled options are shown greyed out and can't be picked (e.g. out of stock)
 */
export default function SearchSelect({ options = [], value, onChange, placeholder = 'Search…', loading, emptyText = 'Nothing found', required, disabled, autoFocus }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const input = useRef(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const hasValue = value !== '' && value != null; // an "All …" option with value '' needs no clear button

  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = options.filter((o) => {
    const hay = `${o.label} ${o.sub || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w)); // every typed word must match (e.g. "rahul it")
  });

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => setActive(0), [text]);

  const choose = (o) => {
    if (o.disabled) return;
    onChange(o.value);
    setText('');
    setOpen(false);
    input.current?.blur();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (open && shown[active]) { e.preventDefault(); choose(shown[active]); } }
    else if (e.key === 'Escape') { setOpen(false); setText(''); }
  };

  return (
    <div ref={box} className="relative">
      <div className={`flex items-center gap-2 h-10 px-3 rounded-lg border ${disabled ? 'bg-paper opacity-70' : 'bg-white'} ${open ? 'border-brand ring-2 ring-brand/15' : 'border-[#D3D9D5]'}`}>
        <Icon name="search" size={16} className="text-muted shrink-0" />
        <input
          ref={input}
          value={open ? text : selected?.label || ''}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setText(''); }}
          disabled={disabled}
          autoFocus={autoFocus}
          onKeyDown={onKey}
          placeholder={selected ? selected.label : placeholder}
          className="flex-1 min-w-0 !border-0 !outline-none !shadow-none !ring-0 !bg-transparent !p-0 !h-auto !rounded-none text-[14px]"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {selected && hasValue && !open && !disabled ? (
          <button type="button" aria-label="Clear" className="bg-transparent border-0 p-0.5 text-muted cursor-pointer" onClick={() => { onChange(''); input.current?.focus(); }}>
            <Icon name="x" size={14} />
          </button>
        ) : (
          <Icon name="chevron" size={14} className="text-muted rotate-90 shrink-0" />
        )}
      </div>
      {/* keeps the browser's "required" check working */}
      {required && <input tabIndex={-1} aria-hidden="true" value={value || ''} onChange={() => {}} required className="absolute inset-x-0 bottom-0 h-px opacity-0 pointer-events-none" />}

      {open && !disabled && (
        <div id={listId} role="listbox" className="absolute z-30 left-0 right-0 top-[calc(100%+4px)] max-h-60 overflow-y-auto bg-white border border-line rounded-lg shadow-[0_10px_28px_rgba(20,48,44,.16)] py-1">
          {loading ? (
            <div className="px-3 py-3 text-[13px] text-muted">Loading…</div>
          ) : !shown.length ? (
            <div className="px-3 py-3 text-[13px] text-muted">{emptyText}</div>
          ) : (
            shown.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                aria-disabled={o.disabled || undefined}
                className={`w-full flex flex-col items-start px-3 py-2 border-0 text-left ${o.disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'} ${i === active && !o.disabled ? 'bg-[#E6F2EF]' : 'bg-transparent'}`}
              >
                <span className={`text-[14px] ${o.value === value ? 'font-semibold text-brand' : ''}`}>{o.label}</span>
                {o.sub && <span className="text-[12.5px] text-muted">{o.sub}</span>}
              </button>
            ))
          )}
          {!loading && options.length > 0 && (
            <div className="px-3 pt-1.5 mt-1 border-t border-line text-[11.5px] text-muted">{shown.length} of {options.length} · type to filter</div>
          )}
        </div>
      )}
    </div>
  );
}
