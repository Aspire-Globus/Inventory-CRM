import { api, fmtDate } from '../api.js';
import Icon from './Icons.jsx';
import { useAsync } from './ui.jsx';
import { money } from './RepairForms.jsx';
import { tw } from './tw.js';

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const ago = (d) => {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};
const fromText = (r) => (r.employeeName ? `${r.employeeName}${r.departmentName ? ` · ${r.departmentName}` : ''}` : 'office stock');

const COLS = {
  damaged: { title: '1 · Damaged', hint: 'Waiting to be sent', box: 'bg-[#FBF7F0] border-[#F1E3CB]', head: 'text-warn' },
  repair: { title: '2 · At repair shop', hint: 'Waiting to come back', box: 'bg-[#F3F6FD] border-[#D5E0F6]', head: 'text-[#1D4ED8]' },
  done: { title: '3 · Done', hint: 'This month', box: 'bg-[#F2F8F3] border-[#CFE6D5]', head: 'text-ok' },
};

function Column({ kind, count, extra, children, loading }) {
  const c = COLS[kind];
  return (
    <section className={`flex flex-col gap-3 p-4 rounded-2xl border min-w-0 ${c.box}`}>
      <div className="flex justify-between items-center gap-2">
        <h2 className={`m-0 text-[16px] font-bold ${c.head}`}>{c.title} <span className="font-medium opacity-80">({count ?? '–'})</span></h2>
        <span className={`text-[12.5px] opacity-80 ${c.head}`}>{extra || c.hint}</span>
      </div>
      {loading ? <div className="text-muted text-[13px] py-6 text-center">Loading…</div> : children}
    </section>
  );
}

const Empty = ({ children }) => <div className="py-8 text-center text-[13px] text-muted border border-dashed border-line rounded-xl bg-white/60">{children}</div>;
const CardBox = ({ children, late, onOpen }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onOpen}
    onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpen()}
    className={`flex flex-col gap-3 p-3.5 bg-white rounded-xl border cursor-pointer hover:shadow-panel transition-shadow ${late ? 'border-[#F3C6C1]' : 'border-line'}`}
  >
    {children}
  </div>
);
// Buttons inside a card must not open the details
const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

export default function RepairBoard({ search, reloadKey, canEdit, onAction }) {
  const params = { search, withPhoto: 1 };
  const damaged = useAsync(() => api.repairs({ ...params, status: 'Damaged' }), [search, reloadKey]);
  const repair = useAsync(() => api.repairs({ search, status: 'In repair' }), [search, reloadKey]);
  const done = useAsync(() => api.repairs({ search, status: 'Done', from: monthStart() }), [search, reloadKey]);
  const spent = (done.data || []).filter((r) => r.status === 'Repaired').reduce((s, r) => s + (r.result?.finalCost || 0), 0);
  const doneRows = [...(done.data || [])].sort((a, b) => new Date(b.result?.date || b.reportedAt) - new Date(a.result?.date || a.reportedAt));

  return (
    <div className="grid gap-4 grid-cols-3 max-lg:grid-cols-1 items-start">
      <Column kind="damaged" count={damaged.data?.length} loading={damaged.loading}>
        {!damaged.data?.length && <Empty>Nothing damaged right now.</Empty>}
        {damaged.data?.map((r) => (
          <CardBox key={r._id} onOpen={() => onAction({ type: 'view', repair: r })}>
            <div className="flex gap-3">
              <div className="w-14 h-14 rounded-lg bg-[#EEF0EC] shrink-0 overflow-hidden grid place-items-center">
                {r.photo ? <img src={r.photo} alt="" className="w-full h-full object-cover" /> : <Icon name="image" size={22} className="text-[#8E9A95]" />}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <b className="text-[15px] font-semibold truncate">{r.quantity > 1 ? `${r.quantity} × ` : ''}{r.itemName}</b>
                <span className="text-[13px] text-warn font-medium">{r.damageType || r.description || 'Damaged'}</span>
                <span className="text-[12.5px] text-muted truncate">from {fromText(r)} · {ago(r.reportedAt)}</span>
              </div>
            </div>
            {r.attempts?.length > 0 && (
              <div className="px-2.5 py-1.5 rounded-md bg-warn-soft text-warn text-[12.5px] font-medium">
                ↩ Not repaired by {r.attempts.map((a) => a.vendor).join(', ')} — try another vendor or scrap
              </div>
            )}
            {canEdit && (
              <div className="flex gap-2">
                <button className={`${tw.btnPrimary} flex-1 justify-center`} onClick={stop(() => onAction({ type: 'send', repair: r }))}>Send to repair →</button>
                <button className={`${tw.btn} !text-danger`} onClick={stop(() => onAction({ type: 'scrap', repair: r }))}>Scrap</button>
              </div>
            )}
          </CardBox>
        ))}
      </Column>

      <Column kind="repair" count={repair.data?.length} loading={repair.loading}>
        {!repair.data?.length && <Empty>Nothing at the repair shop.</Empty>}
        {repair.data?.map((r) => (
          <CardBox key={r._id} late={r.overdueDays > 0} onOpen={() => onAction({ type: 'view', repair: r })}>
            <div className="flex justify-between gap-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <b className="text-[15px] font-semibold truncate">{r.quantity > 1 ? `${r.quantity} × ` : ''}{r.itemName}</b>
                <span className="text-[13px] text-muted truncate">{r.damageType || 'Damaged'} · from {fromText(r)}</span>
              </div>
              {r.overdueDays > 0 && <span className="self-start px-2 py-0.5 rounded-md bg-danger-soft text-danger text-[12px] font-semibold whitespace-nowrap">{r.overdueDays} day{r.overdueDays > 1 ? 's' : ''} late</span>}
            </div>
            <div className="flex justify-between gap-2 px-3 py-2.5 rounded-lg bg-[#F6F7F5] text-[13px]">
              <span className="truncate">{r.repair?.vendor || r.repair?.by}</span>
              <span className="text-muted whitespace-nowrap">
                {r.repair?.expectedAt ? `due ${fmtDate(r.repair.expectedAt)}` : ''}{r.repair?.estimatedCost != null ? ` · ${money(r.repair.estimatedCost)}` : ''}
              </span>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <button className={`${tw.btn} flex-1 justify-center !bg-[#1D4ED8] !border-[#1D4ED8] !text-white font-semibold`} onClick={stop(() => onAction({ type: 'result', repair: r }))}>
                  Got it back →
                </button>
                <button className={`${tw.btn} !text-warn`} onClick={stop(() => onAction({ type: 'notfixed', repair: r }))} title="Vendor gave it back without fixing">
                  Not repaired
                </button>
              </div>
            )}
          </CardBox>
        ))}
      </Column>

      <Column kind="done" count={doneRows.length} loading={done.loading} extra={spent ? `This month · ${money(spent)} spent` : 'This month'}>
        {!doneRows.length && <Empty>Nothing finished this month yet.</Empty>}
        {doneRows.map((r) => (
          <CardBox key={r._id} onOpen={() => onAction({ type: 'view', repair: r })}>
            <div className="flex justify-between items-center gap-2.5">
              <div className="flex flex-col gap-0.5 min-w-0">
                <b className="text-[15px] font-semibold truncate">{r.quantity > 1 ? `${r.quantity} × ` : ''}{r.itemName}</b>
                <span className="text-[12.5px] text-muted truncate">
                  {r.status === 'Repaired'
                    ? `back ${fmtDate(r.result?.date)}${r.result?.finalCost != null ? ` · paid ${money(r.result.finalCost)}` : ''}`
                    : `${r.damageType || r.description || r.status} · ${fmtDate(r.result?.date || r.reportedAt)}`}
                </span>
              </div>
              <span className={`px-2.5 py-1 rounded-md text-[12.5px] font-semibold whitespace-nowrap ${
                r.status === 'Repaired' ? 'bg-ok-soft text-ok' : r.status === 'Scrapped' ? 'bg-danger-soft text-danger' : 'bg-[#F1F2F0] text-[#4A5551]'}`}>
                {r.status === 'Repaired' ? '✓ Fixed · in stock' : r.status === 'Scrapped' ? '✕ Scrapped' : 'Lost'}
              </span>
            </div>
          </CardBox>
        ))}
        <button className="bg-transparent border-0 p-1 text-[13px] text-brand underline cursor-pointer" onClick={() => onAction({ type: 'list' })}>See all history</button>
      </Column>
    </div>
  );
}
