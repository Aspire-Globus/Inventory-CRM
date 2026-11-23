import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadCSV, fmtDate, today } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icons.jsx';
import ReturnForm from '../components/ReturnForm.jsx';
import ReassignForm from '../components/ReassignForm.jsx';
import TransferDetails from '../components/TransferDetails.jsx';
import { ReportDamageForm } from '../components/RepairForms.jsx';
import { BulkBar, CheckAll, CheckCell, Pagination, SortTh, usePagination, useSelection, useSort } from '../components/table.jsx';
import { Empty, Field, Modal, StatusBadge, assignmentStatus, useAsync, useToast } from '../components/ui.jsx';
import { tw } from '../components/tw.js';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { useUrlParam } from '../components/useUrlParam.js';

const canReturn = (a) => a.outstandingQuantity > 0;

function BulkReturn({ rows, onDone, onCancel }) {
  const toast = useToast();
  const [returnDate, setReturnDate] = useState(today());
  const [condition, setCondition] = useState('Good');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const total = rows.reduce((s, a) => s + a.outstandingQuantity, 0);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const results = await Promise.allSettled(
      rows.map((a) => api.returnItem(a._id, { quantity: a.outstandingQuantity, returnDate, condition, notes }))
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = rows.length - ok;
    toast(`${ok} assignment(s) returned${failed ? `, ${failed} failed` : ''}`, ok ? 'success' : 'error');
    setSaving(false);
    onDone();
  };

  return (
    <form onSubmit={submit} className={tw.form}>
      <p className="text-muted">
        Returns the full outstanding quantity for <strong>{rows.length}</strong> assignment(s) — <strong>{total}</strong> item(s) back to stock.
      </p>
      <div className="max-h-[180px] overflow-y-auto border border-line rounded-lg [&>div]:flex [&>div]:justify-between [&>div]:gap-2.5 [&>div]:px-3 [&>div]:py-2 [&>div]:border-b [&>div]:border-line [&>div:last-child]:border-b-0">
        {rows.map((a) => (
          <div key={a._id}>
            <span>{a.outstandingQuantity} × {a.itemName}</span>
            <small className="text-muted">{a.employeeName} ({a.employeeCode})</small>
          </div>
        ))}
      </div>
      <div className={tw.grid2}>
        <Field label="Return Date" required>
          <input type="date" value={returnDate} max={today()} onChange={(e) => setReturnDate(e.target.value)} required />
        </Field>
        <Field label="Condition" hint="Damaged or lost? Use Return or Damage on that row (needs a photo).">
          <select value={condition} onChange={(e) => setCondition(e.target.value)} disabled>
            <option>Good</option>
          </select>
        </Field>
      </div>
      <Field label="Notes (Optional)">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className={tw.formActions}>
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={tw.btnPrimary} disabled={saving}>{saving ? 'Returning…' : `Return ${total} item(s)`}</button>
      </div>
    </form>
  );
}

export default function Assignments() {
  const { can } = useAuth();
  const canAssign = can('assignments');
  const [status, setStatus] = useState(''); // All: shows Assigned, Transferred and Returned together
  const [search, setSearch] = useState('');
  useUrlParam('search', setSearch); // from the global search
  const [returning, setReturning] = useState(null);
  const [reassigning, setReassigning] = useState(null);
  const [damaging, setDamaging] = useState(null);
  const [viewTransfer, setViewTransfer] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [department, setDepartment] = useState(''); // department id ('' = all)
  const { data: departments } = useAsync(api.departments);
  const { data, loading, error, reload } = useAsync(() => api.assignments({ status, search, department }), [status, search, department]);

  const { sorted, sort, toggle } = useSort(data || [], { key: 'issueDate', dir: 'desc' });
  const sel = useSelection(sorted, canReturn);
  const pg = usePagination(sorted);
  const th = (label, field, className) => <SortTh label={label} field={field} sort={sort} onSort={toggle} className={className} />;

  const bulkExport = () =>
    downloadCSV('assignments-selected.csv', sel.selectedRows.map((a) => ({
      'Issue Date': fmtDate(a.issueDate), Item: a.itemName, Category: a.category, 'Employee ID': a.employeeCode,
      Employee: a.employeeName, Department: a.departmentName, Issued: a.quantity, Returned: a.returnedQuantity,
      Holding: a.outstandingQuantity, Status: a.status,
    })));

  return (
    <>
      <div className={tw.pageHead}>
        <h1>Assignments</h1>
        {canAssign && (
          <Link to="/assignments/new" className={tw.btnPrimary}>
            <Icon name="plus" size={18} /> Assign Item
          </Link>
        )}
      </div>
      <section className={tw.card}>
        <div className={tw.cardHead}>
          <div className={tw.seg}>
            {[['', 'All'], ['Active', 'Currently Assigned'], ['Transferred', 'Transferred'], ['Returned', 'Returned']].map(([v, l]) => (
              <button key={l} className={status === v ? 'active' : ''} onClick={() => setStatus(v)}>{l}</button>
            ))}
          </div>
          <div className={tw.filters}>
            <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
              <option value="">All departments</option>
              {(departments || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
            <div className={tw.search}>
              <Icon name="search" size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Employee, ID or item…" />
            </div>
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : error ? (
          <div className="text-danger p-6">{error.message}</div>
        ) : !data.length ? (
          <Empty>{department ? 'No assignments in this department.' : 'No assignments found.'}</Empty>
        ) : (
          <>
          <div className={tw.tableWrap}>
            <BulkBar sel={sel}>
              <button className={tw.btnSm} onClick={bulkExport}><Icon name="download" size={14} /> Export CSV</button>
              {canAssign && <button className={tw.btnSmPrimary} onClick={() => setBulkOpen(true)}><Icon name="undo" size={14} /> Return selected</button>}
            </BulkBar>
            <table className={tw.table}>
              <thead>
                <tr>
                  <CheckAll sel={sel} />
                  {th('Issue Date', 'issueDate')}
                  {th('Item', 'itemName')}
                  {th('Employee', 'employeeName')}
                  {th('Department', 'departmentName')}
                  {th('Issued', 'quantity', 'num')}
                  {th('Returned', 'returnedQuantity', 'num')}
                  {th('Holding', 'outstandingQuantity', 'num')}
                  {th('Status', 'status')}
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pg.pageRows.map((a) => (
                  <tr key={a._id} className={sel.selected.has(a._id) ? 'selected' : ''}>
                    <CheckCell sel={sel} id={a._id} disabled={!canReturn(a)} />
                    <td>{fmtDate(a.issueDate)}</td>
                    <td className="whitespace-nowrap">{a.itemName}<small className="text-muted block">{a.category}</small></td>
                    <td className="whitespace-nowrap">
                      <Link to={`/employees/${a.employeeCode}`}>{a.employeeName}</Link>
                      <small className="text-muted block font-mono text-[12.5px] tracking-tight">{a.employeeCode}</small>
                    </td>
                    <td>{a.departmentName}</td>
                    <td className="text-right tabular-nums">{a.quantity}</td>
                    <td className="text-right tabular-nums">{a.returnedQuantity}</td>
                    <td className="text-right tabular-nums font-semibold">{a.outstandingQuantity}</td>
                    <td className="whitespace-nowrap">
                      <StatusBadge status={assignmentStatus(a)} />
                      {/* What happened to the units that are no longer with this employee */}
                      {a.transferredQuantity > 0 && (
                        <button className="block p-0 mt-0.5 border-0 bg-transparent cursor-pointer text-[11.5px] text-[#5B4BC4] underline text-left" onClick={() => setViewTransfer(a)} title="See who it was handed to">
                          {a.outstandingQuantity > 0 ? `${a.transferredQuantity} ` : ''}to {[...new Set(a.returns.filter((r) => r.transfer?.employeeName).map((r) => r.transfer.employeeName))].join(', ')}
                        </button>
                      )}
                      {(() => {
                        // Split the returned units: back to stock / damaged / lost
                        const sumOf = (c) => a.returns.filter((r) => !r.transfer?.employeeName && c.includes(r.condition)).reduce((s, r) => s + r.quantity, 0);
                        const damaged = sumOf(['Damaged', 'Faulty']);
                        const lost = sumOf(['Lost']);
                        const good = a.returnedQuantity - (a.transferredQuantity || 0) - damaged - lost;
                        return (
                          <>
                            {a.outstandingQuantity > 0 && good > 0 && <small className="block mt-0.5 text-[11.5px] text-muted">{good} returned to stock</small>}
                            {damaged > 0 && <Link to="/repairs" className="block mt-0.5 text-[11.5px] text-warn underline">{damaged} damaged</Link>}
                            {lost > 0 && <small className="block mt-0.5 text-[11.5px] text-danger">{lost} lost</small>}
                          </>
                        );
                      })()}
                      {a.transferredFrom?.employeeName && (
                        <button className="block p-0 mt-0.5 border-0 bg-transparent cursor-pointer text-[11.5px] text-muted underline" onClick={() => setViewTransfer(a)} title="See who it came from">
                          from {a.transferredFrom.employeeName}
                        </button>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {canAssign && canReturn(a) && (
                        <span className="inline-flex gap-1.5">
                          <button className={tw.btnSm} onClick={() => setReassigning(a)} title="Give it straight to another employee">
                            <Icon name="arrow" size={14} /> Reassign
                          </button>
                          <button className={tw.btnSm} onClick={() => setReturning(a)}>
                            <Icon name="undo" size={14} /> Return
                          </button>
                          <button className={tw.btnSmDanger} onClick={() => setDamaging(a)} title="Damaged or lost while with the employee">
                            <Icon name="alert" size={14} /> Damage
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pg={pg} label="assignments" />
          </>
        )}
      </section>
      {returning && (
        <Modal title="Return Item" onClose={() => setReturning(null)} width={520}>
          <ReturnForm assignment={returning} onCancel={() => setReturning(null)} onDone={() => { setReturning(null); reload(); }} />
        </Modal>
      )}
      {viewTransfer && (
        <Modal title={`Transfer — ${viewTransfer.itemName}`} onClose={() => setViewTransfer(null)} width={620}>
          <TransferDetails assignment={viewTransfer} onClose={() => setViewTransfer(null)} />
        </Modal>
      )}
      {reassigning && (
        <Modal title="Reassign Item" onClose={() => setReassigning(null)} width={600}>
          <ReassignForm assignment={reassigning} onCancel={() => setReassigning(null)} onDone={() => { setReassigning(null); reload(); }} />
        </Modal>
      )}
      {damaging && (
        <Modal title="Mark as damaged or lost" onClose={() => setDamaging(null)} width={500}>
          <ReportDamageForm assignment={damaging} onCancel={() => setDamaging(null)} onDone={() => { setDamaging(null); reload(); }} />
        </Modal>
      )}
      {bulkOpen && (
        <Modal title="Bulk Return" onClose={() => setBulkOpen(false)} width={560}>
          <BulkReturn rows={sel.selectedRows} onCancel={() => setBulkOpen(false)} onDone={() => { setBulkOpen(false); sel.clear(); reload(); }} />
        </Modal>
      )}
    </>
  );
}
