import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icons.jsx';
import { tw } from './tw.js';

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-[22px] right-[22px] z-[60] flex flex-col gap-2.5">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-center gap-2.5 max-w-[380px] px-4 py-3 rounded-xl text-white font-medium shadow-pop animate-pop ${t.type === 'error' ? 'bg-danger' : 'bg-ok'}`}>
            <Icon name={t.type === 'error' ? 'x' : 'check'} size={16} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, width = 560 }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 !m-0 z-50 grid place-items-center p-4 bg-pine/50 animate-fade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal w-full max-h-[calc(100vh-32px)] overflow-auto bg-white rounded-2xl shadow-pop animate-pop" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-[22px] py-[18px] border-b border-line">
          <h3>{title}</h3>
          <button className={tw.iconBtn} onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="p-[22px] [&_.table-wrap]:!p-0">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Row action menu ----------
   Rendered in a portal with fixed positioning so it is never clipped by a
   scrolling table, and it opens upwards when there is no room below. */
export function ActionMenu({ actions }) {
  const [pos, setPos] = useState(null); // { top, left } when open
  const btnRef = useRef();
  const menuRef = useRef();
  const items = actions.filter(Boolean);

  const open = () => {
    const r = btnRef.current.getBoundingClientRect();
    const MENU_W = 200;
    const estH = items.length * 38 + 12;
    const below = window.innerHeight - r.bottom;
    const top = below < estH + 8 && r.top > estH + 8 ? r.top - estH - 4 : r.bottom + 4;
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    setPos({ top, left });
  };

  useEffect(() => {
    if (!pos) return;
    const close = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setPos(null);
    };
    const shut = () => setPos(null);
    const onKey = (e) => e.key === 'Escape' && setPos(null);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('resize', shut);
      window.removeEventListener('keydown', onKey);
    };
  }, [pos]);

  // Nothing to do on this row (e.g. an inactive employee): no ⋮ button at all
  if (!items.length) return null;

  return (
    <div className="relative inline-block">
      <button ref={btnRef} className={tw.iconBtn} onClick={() => (pos ? setPos(null) : open())} aria-label="Actions" aria-expanded={!!pos}>
        <Icon name="dots" size={18} />
      </button>
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: pos.top, left: pos.left, width: 200 }}
            className="menu fixed z-[70] p-1.5 text-left bg-white border border-line rounded-xl shadow-pop animate-pop [&>button]:flex [&>button]:items-center [&>button]:gap-2.5 [&>button]:w-full [&>button]:px-2.5 [&>button]:py-2 [&>button]:rounded-md [&>button]:border-0 [&>button]:bg-transparent [&>button]:cursor-pointer [&>button]:text-ink [&>button]:text-[14px] [&>button:hover]:bg-paper [&>button.danger]:text-danger"
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((a) => (
              <button
                key={a.label}
                role="menuitem"
                className={a.danger ? 'danger' : ''}
                onClick={(e) => {
                  e.stopPropagation();
                  setPos(null);
                  a.onClick();
                }}
              >
                {a.icon && <Icon name={a.icon} size={15} />} {a.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

export const Field = ({ label, required, children, hint }) => (
  <label className="field flex flex-col gap-1.5 [&_input:not([type=checkbox])]:h-10 [&_input]:w-full [&_input]:px-3 [&_input]:rounded-lg [&_input]:border [&_input]:border-[#D3D9D5] [&_input]:bg-white [&_input]:outline-none [&_select]:h-10 [&_select]:w-full [&_select]:px-3 [&_select]:rounded-lg [&_select]:border [&_select]:border-[#D3D9D5] [&_select]:bg-white [&_select]:outline-none [&_textarea]:w-full [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-[#D3D9D5] [&_textarea]:bg-white [&_textarea]:outline-none [&_textarea]:resize-y [&_input:focus]:border-brand [&_input:focus]:ring-4 [&_input:focus]:ring-brand-ring [&_select:focus]:border-brand [&_select:focus]:ring-4 [&_select:focus]:ring-brand-ring [&_textarea:focus]:border-brand [&_textarea:focus]:ring-4 [&_textarea:focus]:ring-brand-ring [&_input.invalid]:border-danger [&_input.readonly]:bg-paper [&_input.readonly]:text-muted [&_input:disabled]:bg-paper [&_input:disabled]:cursor-not-allowed [&_select:disabled]:bg-paper [&_select:disabled]:cursor-not-allowed">
    <span className="font-semibold text-[13px] [&_em]:text-danger [&_em]:not-italic">
      {label} {required && <em>*</em>}
    </span>
    {children}
    {hint && <span className="field-hint text-xs text-muted">{hint}</span>}
  </label>
);

// Status chip colours (squared, like printed asset labels)
export const BADGE = {
  green: 'bg-ok-soft text-ok',
  blue: 'bg-brand-soft text-brand',
  amber: 'bg-warn-soft text-warn',
  grey: 'bg-[#EBEEEA] text-muted',
  red: 'bg-danger-soft text-danger',
};

export const Empty = ({ children }) => <div className="px-5 py-10 text-center text-muted">{children}</div>;

// Only three states for an assignment: Assigned (still holds something), Transferred, Returned
export const assignmentStatus = (a) =>
  a.quantity - a.returnedQuantity > 0 ? 'Assigned' : (a.transferredQuantity || 0) >= a.returnedQuantity ? 'Transferred' : 'Returned';

export const StatusBadge = ({ status }) => {
  const cls = { Assigned: BADGE.blue, 'Partially Returned': BADGE.amber, Returned: BADGE.grey, Transferred: 'bg-[#EFEDFF] text-[#5B4BC4]', 'Partially Transferred': 'bg-[#EFEDFF] text-[#5B4BC4]', Active: BADGE.green, Inactive: BADGE.grey,
    Damaged: BADGE.amber, 'In repair': 'bg-[#E6EEFB] text-[#1D4ED8]', Repaired: BADGE.green, Scrapped: BADGE.red, Lost: BADGE.red }[status] || BADGE.grey;
  return <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${cls}`}>{status}</span>;
};

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return fn()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
}
