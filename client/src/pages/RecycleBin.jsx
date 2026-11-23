import { useState } from 'react';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icons.jsx';
import { Empty, useAsync, useToast } from '../components/ui.jsx';
import { Pagination, usePagination } from '../components/table.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { tw } from '../components/tw.js';

const KINDS = ['Item', 'Employee', 'Department', 'User', 'Category'];
const ICON = { Item: 'box', Employee: 'users', Department: 'building', User: 'users', Category: 'Other' };
const PLURAL = { Category: 'Categories' };

export default function RecycleBin() {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(null);
  const { data, loading, error, reload } = useAsync(() => api.trash({ kind }), [kind]);

  const run = async (id, fn, okMsg) => {
    setBusy(id);
    try {
      await fn();
      toast(okMsg);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const restore = (t) => run(t._id, () => api.restoreTrash(t._id), `${t.kind} "${t.name}" restored`);
  const purge = (t) =>
    confirm(`Permanently delete ${t.kind.toLowerCase()} "${t.name}"? This cannot be undone.`) &&
    run(t._id, () => api.purgeTrash(t._id), 'Permanently deleted');
  const emptyAll = () =>
    confirm('Permanently delete EVERYTHING in the Recycle Bin? This cannot be undone.') &&
    run('all', () => api.emptyTrash(), 'Recycle Bin emptied');

  const items = data?.items || [];
  const pg = usePagination(items);

  return (
    <>
      <div className={tw.pageHead}>
        <div>
          <h1>Recycle Bin</h1>
          <p className="text-muted text-[12.5px]" style={{ margin: '6px 0 0' }}>
            Deleted records are kept for {data?.retentionDays ?? 30} days, then removed automatically.
          </p>
        </div>
        {isAdmin && items.length > 0 && (
          <button className={tw.btnDanger} onClick={emptyAll} disabled={busy === 'all'}>
            <Icon name="trash" size={16} /> Empty Recycle Bin
          </button>
        )}
      </div>

      <section className={tw.card}>
        <div className={tw.cardHead}>
          <div className={tw.seg}>
            <button className={!kind ? 'active' : ''} onClick={() => setKind('')}>All</button>
            {KINDS.map((k) => (
              <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{PLURAL[k] || `${k}s`}</button>
            ))}
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : error ? (
          <div className="text-danger p-6">{error.message}</div>
        ) : !items.length ? (
          <Empty>The Recycle Bin is empty.</Empty>
        ) : (
          <>
          <div className={tw.tableWrap}>
            <table className={tw.table}>
              <thead>
                <tr><th>Type</th><th>Name</th><th>Deleted By</th><th>Deleted On</th><th>Auto-delete</th><th className="text-right">Action</th></tr>
              </thead>
              <tbody>
                {pg.pageRows.map((t) => (
                  <tr key={t._id}>
                    <td><span className={tw.itemCell}><Icon name={ICON[t.kind]} size={18} className="text-brand" /> {t.kind}</span></td>
                    <td>
                      <strong>{t.name}</strong>
                      {t.summary && <small className="text-muted block">{t.summary}</small>}
                    </td>
                    <td>{t.deletedBy?.name}<small className="text-muted block">{t.deletedBy?.role}</small></td>
                    <td>{fmtDate(t.createdAt)}</td>
                    <td>
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${t.daysLeft <= 5 ? 'bg-danger-soft text-danger' : 'bg-[#EBEEEA] text-muted'}`}>
                        {t.daysLeft === 0 ? 'Today' : `in ${t.daysLeft} day${t.daysLeft === 1 ? '' : 's'}`}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center gap-2.5 flex-wrap" style={{ justifyContent: 'flex-end' }}>
                        <button className={tw.btnSmPrimary} onClick={() => restore(t)} disabled={busy === t._id}>
                          <Icon name="undo" size={14} /> Restore
                        </button>
                        {isAdmin && (
                          <button className={tw.btnSmDanger} onClick={() => purge(t)} disabled={busy === t._id} title="Delete permanently">
                            <Icon name="trash" size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pg={pg} label="records" />
          </>
        )}
      </section>
    </>
  );
}
