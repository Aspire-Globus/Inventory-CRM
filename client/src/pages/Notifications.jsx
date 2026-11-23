import { useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icons.jsx';
import { Empty, useAsync, useToast } from '../components/ui.jsx';
import { Pagination, usePagination } from '../components/table.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { tw } from '../components/tw.js';

const ACTION = {
  created: { label: 'Created', cls: 'bg-ok-soft text-ok', icon: 'plus' },
  updated: { label: 'Edited', cls: 'bg-brand-soft text-brand', icon: 'edit' },
  deleted: { label: 'Deleted', cls: 'bg-danger-soft text-danger', icon: 'trash' },
  restored: { label: 'Restored', cls: 'bg-ok-soft text-ok', icon: 'undo' },
  purged: { label: 'Permanently deleted', cls: 'bg-danger-soft text-danger', icon: 'trash' },
  assigned: { label: 'Assigned', cls: 'bg-brand-soft text-brand', icon: 'arrow' },
  returned: { label: 'Returned', cls: 'bg-warn-soft text-warn', icon: 'undo' },
  reassigned: { label: 'Reassigned', cls: 'bg-brand-soft text-brand', icon: 'arrow' },
  stock_added: { label: 'Stock added', cls: 'bg-ok-soft text-ok', icon: 'box' },
  damaged: { label: 'Damaged', cls: 'bg-warn-soft text-warn', icon: 'alert' },
  lost: { label: 'Lost', cls: 'bg-danger-soft text-danger', icon: 'alert' },
  sent_to_repair: { label: 'Sent to repair', cls: 'bg-[#E6EEFB] text-[#1D4ED8]', icon: 'wrench' },
  repaired: { label: 'Repaired', cls: 'bg-ok-soft text-ok', icon: 'check' },
  not_repaired: { label: 'Not repaired', cls: 'bg-warn-soft text-warn', icon: 'undo' },
  scrapped: { label: 'Scrapped', cls: 'bg-danger-soft text-danger', icon: 'trash' },
};

export const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(d).toLocaleDateString('en-GB');
};

export const fullTime = (d) =>
  new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function NotificationItem({ n, open, onToggle }) {
  const a = ACTION[n.action] || { label: n.action, cls: 'bg-[#EBEEEA] text-muted', icon: 'dots' };
  return (
    <li className={`border-b border-line last:border-b-0 [&.unread_.notif-msg]:font-semibold ${n.read ? '' : 'unread'}`}>
      <button className="flex items-start gap-3 w-full px-1.5 py-3 text-left rounded-lg border-0 bg-transparent cursor-pointer hover:bg-[#F8F9F7]" onClick={onToggle}>
        <span className={`grid place-items-center w-[30px] h-[30px] rounded-full shrink-0 ${a.cls}`}><Icon name={a.icon} size={15} /></span>
        <span className="flex-1 min-w-0 flex flex-col gap-1 [&_small]:text-xs [&_small]:text-muted [&_.badge]:text-[11px] [&_.badge]:px-1.5 [&_.badge]:mr-1">
          <span className="notif-msg break-all">{n.message}</span>
          <small>
            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${a.cls}`}>{a.label}</span> {n.entity} · {n.actor?.name} ({n.actor?.role}) · {timeAgo(n.createdAt)}
          </small>
        </span>
        {!n.read && <span className="w-2 h-2 mt-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
      </button>
      {open && (
        <div className="ml-12 mr-1.5 mb-3.5 px-3.5 py-3 bg-[#F8F9F7] border border-line rounded-xl max-md:ml-1.5">
          <dl className="kv my-[18px] px-4 py-2 border border-line rounded-xl [&_div]:grid [&_div]:grid-cols-[150px_1fr] [&_div]:py-2 [&_dt]:text-muted [&_dd]:m-0 [&_dd]:font-medium !m-0 !mb-2.5 !border-0 !p-0 [&_div]:!grid-cols-[90px_1fr] [&_div]:!py-0.5 [&_div]:text-[13px]">
            <div><dt>When</dt><dd>{fullTime(n.createdAt)}</dd></div>
            <div><dt>Done by</dt><dd>{n.actor?.name} — {n.actor?.role}{n.actor?.email ? ` (${n.actor.email})` : ''}</dd></div>
            <div><dt>Record</dt><dd>{n.entity}{n.entityName ? `: ${n.entityName}` : ''}</dd></div>
            {n.meta?.notes && <div><dt>Notes</dt><dd>{n.meta.notes}</dd></div>}
          </dl>
          {n.changes?.length > 0 && (
            <table className="w-full border-collapse [&_th]:bg-paper [&_th]:font-semibold [&_th:not(.text-right)]:text-left [&_th]:text-[12.5px] [&_th]:text-muted [&_th]:px-3.5 [&_th]:py-2.5 [&_th]:whitespace-nowrap [&_th]:border-y [&_th]:border-line [&_th:first-child]:border-l [&_th:first-child]:rounded-tl-lg [&_th:last-child]:border-r [&_th:last-child]:rounded-tr-lg [&_td]:px-3.5 [&_td]:py-3 [&_td]:border-b [&_td]:border-line [&_td]:align-middle [&_tbody_tr:hover]:bg-[#F8F9F7] [&_tr.selected]:!bg-brand-soft [&_tr.clickable]:cursor-pointer [&_input[type=checkbox]]:w-4 [&_input[type=checkbox]]:h-4 [&_input[type=checkbox]]:cursor-pointer [&_input[type=checkbox]:disabled]:opacity-35 [&_input[type=checkbox]:disabled]:cursor-not-allowed [&_th]:!py-1.5 [&_td]:!py-1.5 [&_td]:!px-2.5 [&_th]:!px-2.5 [&_td]:text-[13px] [&_td]:bg-white">
              <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
              <tbody>
                {n.changes.map((c, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{c.field}</td>
                    <td className="text-muted">{readable(c.field, c.from)}</td>
                    <td className="font-medium">{readable(c.field, c.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}



// Turn raw values (0, 1, true, false) into words anyone can read
const COUNT_FIELDS = /quantity|holding|stock|available|count/i;
function readable(field, v) {
  const t = String(v ?? '').trim();
  if (!t || t === '—' || t === '-') return '—';
  if (t === 'true') return 'Yes';
  if (t === 'false') return 'No';
  if (/^\d+$/.test(t) && COUNT_FIELDS.test(field)) {
    const n = Number(t);
    if (/holding/i.test(field)) return n === 0 ? 'Nothing (all given back)' : `${n} item${n > 1 ? 's' : ''} with employee`;
    if (/stock|available/i.test(field)) return n === 0 ? 'None left in stock' : `${n} in stock`;
    return n === 0 ? 'None' : `${n} item${n > 1 ? 's' : ''}`;
  }
  return t;
}
export default function Notifications() {
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [entity, setEntity] = useState('');
  const [openId, setOpenId] = useState(null);
  const { data, loading, error, reload } = useAsync(
    () => api.notifications({ unread: unreadOnly ? 'true' : '', entity, limit: 300 }),
    [unreadOnly, entity]
  );
  const pg = usePagination(data || []);

  const toggle = async (n) => {
    setOpenId((id) => (id === n._id ? null : n._id));
    if (!n.read) {
      await api.markRead(n._id).catch(() => {});
      n.read = true;
      window.dispatchEvent(new Event('notifications:changed'));
    }
  };

  const readAll = async () => {
    await api.markAllRead();
    toast('All notifications marked as read');
    window.dispatchEvent(new Event('notifications:changed'));
    reload();
  };

  return (
    <>
      <div className={tw.pageHead}>
        <h1>Notifications</h1>
        <button className={tw.btn} onClick={readAll}><Icon name="check" size={16} /> Mark all as read</button>
      </div>
      <section className={tw.card}>
        <div className={tw.cardHead}>
          <div className={tw.seg}>
            <button className={!unreadOnly ? 'active' : ''} onClick={() => setUnreadOnly(false)}>All</button>
            <button className={unreadOnly ? 'active' : ''} onClick={() => setUnreadOnly(true)}>Unread</button>
          </div>
          <div className={tw.filters}>
            <select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">All records</option>
              {['Item', 'Category', 'Assignment', 'Employee', 'Department', 'User', 'Recycle Bin'].map((e) => <option key={e}>{e}</option>)}
            </select>
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={8} cols={4} />
        ) : error ? (
          <div className="text-danger p-6">{error.message}</div>
        ) : !data.length ? (
          <Empty>{unreadOnly ? 'You’re all caught up.' : 'No changes by other users yet. (Your own changes are not shown here.)'}</Empty>
        ) : (
          <>
          <ul className="list-none m-0 px-5 pb-4">
            {pg.pageRows.map((n) => (
              <NotificationItem key={n._id} n={n} open={openId === n._id} onToggle={() => toggle(n)} />
            ))}
          </ul>
          <Pagination pg={pg} label="notifications" />
          </>
        )}
      </section>
    </>
  );
}
