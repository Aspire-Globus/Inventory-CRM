import { Link } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import Icon from '../components/Icons.jsx';
import { Empty, useAsync } from '../components/ui.jsx';
import { tw } from '../components/tw.js';
import { PageSkeleton } from '../components/Skeleton.jsx';
import { useCategories } from '../categories.jsx';

// Stock per category: Total, In use (with employees) and Available (on the shelf)
export function CategoryCards({ data }) {
  const cats = useCategories();
  if (!data?.length) return null;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
      {data.map((c) => {
        const inUse = c.assigned ?? c.total - c.available - (c.repair || 0);
        const usedPct = c.total ? Math.round((inUse / c.total) * 100) : 0;
        const low = c.available <= 5;
        return (
          <div key={c.category} className={`${tw.card} relative p-5 pl-6 overflow-hidden`}>
            <span className={`absolute inset-y-0 left-0 w-1.5 ${low ? 'bg-warn' : 'bg-brand'}`} />
            <div className="flex items-center gap-2 text-ink">
              <Icon name={cats?.icon(c.category) || c.category} size={18} className="text-brand" />
              <span className="flex-1 text-[14px] font-semibold truncate">{c.category === 'System' ? 'Systems' : c.category}</span>
              {low && <span className="ml-auto px-2 py-0.5 rounded-md bg-warn-soft text-warn text-[11px] font-semibold">Low stock</span>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <strong className="block text-[22px] leading-none font-semibold tabular-nums">{c.total}</strong>
                <span className="block mt-1.5 text-[12px] text-muted">Total</span>
              </div>
              <div className="border-x border-line">
                <strong className="block text-[22px] leading-none font-semibold tabular-nums text-brand">{inUse}</strong>
                <span className="block mt-1.5 text-[12px] text-muted">In use</span>
              </div>
              <div>
                <strong className={`block text-[22px] leading-none font-semibold tabular-nums ${low ? 'text-warn' : 'text-ok'}`}>{c.available}</strong>
                <span className="block mt-1.5 text-[12px] text-muted">Available</span>
              </div>
            </div>
            <div className="mt-4 h-1.5 rounded-full bg-[#E6EAE6] overflow-hidden" title={`${usedPct}% in use`}>
              <span className="block h-full bg-brand" style={{ width: `${usedPct}%` }} />
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted flex justify-between">
              <span>{inUse > 0 && usedPct === 0 ? '<1' : usedPct}% in use</span>
              {c.repair > 0 && <span className="text-warn font-semibold">{c.repair} damaged / in repair</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { data, loading, error } = useAsync(api.dashboard);

  if (loading) return <PageSkeleton />;
  if (error) return <div className="card bg-white border border-line rounded-xl shadow-panel p-6 text-danger">Could not reach the server: {error.message}</div>;

  const { totals, byCategory, departments, activeAssignments, recent, lowStock } = data;

  return (
    <>
      <div className={tw.pageHead}>
        <h1>Dashboard</h1>
        <Link to="/assignments/new" className={tw.btnPrimary}>
          <Icon name="plus" size={18} /> Assign Item
        </Link>
      </div>

      <div className={`${tw.card} grid grid-cols-5 divide-x divide-line max-lg:grid-cols-3 max-lg:divide-x-0 max-sm:grid-cols-2`}>
        {[
          ['Total stock', totals.total],
          ['With employees', totals.assigned],
          ['On the shelf', totals.available],
          ['Open assignments', activeAssignments],
          ['Departments', departments],
        ].map(([label, value]) => (
          <div key={label} className="px-5 py-4">
            <span className="text-[13px] text-muted">{label}</span>
            <strong className="block mt-1 text-2xl font-semibold tabular-nums">{value}</strong>
          </div>
        ))}
      </div>

      <CategoryCards data={byCategory} />

      <div className="grid grid-cols-[3fr_2fr] gap-5 max-lg:grid-cols-1 items-start">
        <section className={tw.card}>
          <div className={tw.cardHead}>
            <h2>Recent Activity</h2>
            <Link to="/reports" className="text-brand font-medium">View all</Link>
          </div>
          {recent.length ? (
            <ul className="list-none m-0 px-5 pt-1 pb-4 [&_li]:flex [&_li]:gap-3 [&_li]:py-3 [&_li]:border-b [&_li]:border-line [&_li:last-child]:border-b-0 [&_small]:block [&_small]:text-muted [&_small]:mt-0.5">
              {recent.map((a) => (
                <li key={a._id}>
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${a.type === 'ASSIGN' ? 'bg-brand' : 'bg-ok'}`} />
                  <div>
                    <strong>{a.type === 'ASSIGN' ? 'Assigned' : 'Returned'}</strong> {a.quantity} × {a.itemName}{' '}
                    {a.type === 'ASSIGN' ? 'to' : 'from'}{' '}
                    <Link to={`/employees/${a.employeeCode}`}>{a.employeeName}</Link>
                    <small>
                      {a.employeeCode} · {a.departmentName} · {fmtDate(a.date)}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing assigned yet. Use Assign item to issue the first one.</Empty>
          )}
        </section>

        <section className={tw.card}>
          <div className={tw.cardHead}>
            <h2>Running low</h2>
            <span className="text-[13px] text-muted">5 or fewer on the shelf</span>
          </div>
          {lowStock.length ? (
            <table className={`${tw.table} [&_td]:!px-5`}>
              <tbody>
                {lowStock.map((i) => (
                  <tr key={i._id}>
                    <td>{i.name}</td>
                    <td className="text-muted">{i.category}</td>
                    <td className="text-right tabular-nums text-danger">{i.availableQuantity} left</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Every item has more than 5 on the shelf.</Empty>
          )}
        </section>
      </div>
    </>
  );
}
