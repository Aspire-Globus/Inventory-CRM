import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadCSV, fmtDate } from '../api.js';
import Icon from '../components/Icons.jsx';
import { BADGE, Empty, useAsync } from '../components/ui.jsx';
import { Pagination, usePagination } from '../components/table.jsx';
import { tw } from '../components/tw.js';

function StockReport() {
  const { data, loading } = useAsync(api.stockReport);
  const pg = usePagination(data || []);
  if (loading) return <div className={tw.loading}>Loading…</div>;
  const rows = data.map((i) => ({
    Item: i.name, Category: i.category, Total: i.totalQuantity, Assigned: i.assignedQuantity, Available: i.availableQuantity, Unit: i.unit,
  }));
  return (
    <>
      <div className={tw.cardHead}>
        <h2>Stock Summary</h2>
        <button className={tw.btnSm} onClick={() => downloadCSV('stock-summary.csv', rows)}><Icon name="download" size={14} /> Export CSV</button>
      </div>
      {!rows.length ? <Empty>No items.</Empty> : (
        <>
        <div className={tw.tableWrap}>
          <table className={tw.table}>
            <thead><tr><th>Item</th><th>Category</th><th className="text-right tabular-nums">Total</th><th className="text-right tabular-nums">Assigned</th><th className="text-right tabular-nums">Available</th><th>Usage</th></tr></thead>
            <tbody>
              {pg.pageRows.map((i) => {
                const pct = i.totalQuantity ? Math.round((i.assignedQuantity / i.totalQuantity) * 100) : 0;
                return (
                  <tr key={i._id}>
                    <td>{i.name}</td><td>{i.category}</td>
                    <td className="text-right tabular-nums">{i.totalQuantity}</td><td className="text-right tabular-nums">{i.assignedQuantity}</td>
                    <td className="text-right tabular-nums font-semibold text-ok">{i.availableQuantity}</td>
                    <td><div className="h-1.5 w-[120px] mb-1 rounded-full bg-[#E6EAE6] overflow-hidden [&_span]:block [&_span]:h-full [&_span]:bg-brand"><span style={{ width: `${pct}%` }} /></div><small className="text-muted">{pct}% in use</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination pg={pg} label="items" />
        </>
      )}
    </>
  );
}

function DepartmentReport() {
  const { data, loading } = useAsync(api.departmentReport);
  const pivot = useMemo(() => {
    if (!data) return { cats: [], rows: [] };
    const cats = [...new Set(data.map((r) => r.category))].sort();
    const map = {};
    data.forEach((r) => {
      map[r.department] ??= { Department: r.department || '—' };
      map[r.department][r.category] = r.quantity;
    });
    const rows = Object.values(map).map((r) => ({ ...r, Total: cats.reduce((s, c) => s + (r[c] || 0), 0) }));
    return { cats, rows };
  }, [data]);
  if (loading) return <div className={tw.loading}>Loading…</div>;
  return (
    <>
      <div className={tw.cardHead}>
        <h2>Items Held by Department</h2>
        <button className={tw.btnSm} onClick={() => downloadCSV('by-department.csv', pivot.rows)}><Icon name="download" size={14} /> Export CSV</button>
      </div>
      {!pivot.rows.length ? <Empty>Nothing assigned yet.</Empty> : (
        <div className={tw.tableWrap}>
          <table className={tw.table}>
            <thead><tr><th>Department</th>{pivot.cats.map((c) => <th key={c} className="text-right tabular-nums">{c}</th>)}<th className="text-right tabular-nums">Total</th></tr></thead>
            <tbody>
              {pivot.rows.map((r) => (
                <tr key={r.Department}>
                  <td>{r.Department}</td>
                  {pivot.cats.map((c) => <td key={c} className="text-right tabular-nums">{r[c] || 0}</td>)}
                  <td className="text-right tabular-nums font-semibold">{r.Total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ActivityReport() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState('');
  const { data, loading } = useAsync(() => api.activity({ from, to, type }), [from, to, type]);
  const pg = usePagination(data || []);
  const label = { ASSIGN: 'Assigned', RETURN: 'Returned', STOCK_ADD: 'Stock added', STOCK_UPDATE: 'Stock changed' };
  const rows = (data || []).map((a) => ({
    Date: fmtDate(a.date), Type: label[a.type], Item: a.itemName, Quantity: a.quantity,
    'Employee ID': a.employeeCode || '', Employee: a.employeeName || '', Department: a.departmentName || '', Notes: a.notes || '',
  }));
  return (
    <>
      <div className={tw.cardHead}>
        <h2>Movement History</h2>
        <div className={tw.filters}>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(label).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          <button className={tw.btnSm} onClick={() => downloadCSV('movement-history.csv', rows)}><Icon name="download" size={14} /> CSV</button>
        </div>
      </div>
      {loading ? <div className={tw.loading}>Loading…</div> : !rows.length ? <Empty>No activity in this range.</Empty> : (
        <>
        <div className={tw.tableWrap}>
          <table className={tw.table}>
            <thead><tr><th>Date</th><th>Type</th><th>Item</th><th className="text-right tabular-nums">Qty</th><th>Employee</th><th>Department</th><th>Notes</th></tr></thead>
            <tbody>
              {pg.pageRows.map((a) => (
                <tr key={a._id}>
                  <td>{fmtDate(a.date)}</td>
                  <td><span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${a.type === 'ASSIGN' ? BADGE.blue : a.type === 'RETURN' ? BADGE.green : BADGE.grey}`}>{label[a.type]}</span></td>
                  <td>{a.itemName}</td>
                  <td className="text-right tabular-nums">{a.quantity > 0 && a.type === 'STOCK_UPDATE' ? `+${a.quantity}` : a.quantity}</td>
                  <td>{a.employeeCode ? <Link to={`/employees/${a.employeeCode}`}>{a.employeeName}</Link> : '—'}</td>
                  <td>{a.departmentName || '—'}</td>
                  <td className="text-muted">{a.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination pg={pg} label="records" />
        </>
      )}
    </>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('stock');
  return (
    <>
      <div className={tw.pageHead}><h1>Reports</h1></div>
      <section className={tw.card}>
        <div className={tw.tabs}>
          <button className={tab === 'stock' ? 'active' : ''} onClick={() => setTab('stock')}>Stock Summary</button>
          <button className={tab === 'dept' ? 'active' : ''} onClick={() => setTab('dept')}>By Department</button>
          <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Movement History</button>
        </div>
        {tab === 'stock' && <StockReport />}
        {tab === 'dept' && <DepartmentReport />}
        {tab === 'activity' && <ActivityReport />}
      </section>
    </>
  );
}
