import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icons.jsx';
import ReturnForm from '../components/ReturnForm.jsx';
import { Empty, Modal, StatusBadge, assignmentStatus, useAsync } from '../components/ui.jsx';
import { EmployeeForm, initials } from './Employees.jsx';
import { useCrm } from '../components/Crm.jsx';
import { PageSkeleton } from '../components/Skeleton.jsx';
import { tw } from '../components/tw.js';

export default function EmployeeDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const crm = useCrm();
  const canManage = can('employees') && !crm.enabled; // edited in the CRM when the link is on
  const canDelete = canManage && can('delete');
  const navigate = useNavigate();
  const [tab, setTab] = useState('assigned');
  const [returning, setReturning] = useState(null);
  const [editing, setEditing] = useState(false);
  const { data, loading, error, reload } = useAsync(() => api.employee(id), [id]);

  if (loading) return <PageSkeleton />;
  if (error)
    return (
      <div className={tw.cardPad}>
        <p className="text-danger">{error.message}</p>
        <Link to="/employees" className="text-brand font-medium">← Back to employees</Link>
      </div>
    );

  const { employee: emp, assignments, history } = data;
  const active = assignments.filter((a) => a.outstandingQuantity > 0);
  const held = active.reduce((s, a) => s + a.outstandingQuantity, 0);

  return (
    <>
      <div className={tw.pageHead}>
        <div>
          <Link to="/employees" className="text-brand font-medium text-[12.5px]">← Employees</Link>
          <h1>Employee Inventory</h1>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {canManage && (
            <button className={tw.btn} onClick={() => setEditing(true)}>
              <Icon name="edit" size={16} /> Edit
            </button>
          )}
          {emp.status === 'Active' && (
            <Link to={`/assignments/new?employee=${emp.employeeId}`} className={tw.btnPrimary}>
              <Icon name="plus" size={18} /> Assign Item
            </Link>
          )}
        </div>
      </div>

      <section className="card bg-white border border-line rounded-xl shadow-panel flex flex-wrap items-center gap-6 p-6">
        <div className="grid place-items-center rounded-full font-semibold shrink-0 w-20 h-20 bg-[#E3E8E5] text-pine text-[28px]">{initials(emp.name)}</div>
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2>{emp.name}</h2>
            <StatusBadge status={emp.status} />
          </div>
          <dl className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-6 gap-y-3 mt-3.5 [&_dt]:text-xs [&_dt]:text-muted [&_dd]:mt-0.5 [&_dd]:font-medium">
            <div><dt>Employee ID</dt><dd className="font-mono text-[12.5px] tracking-tight">{emp.employeeId}</dd></div>
            <div><dt>Department</dt><dd>{emp.department?.name}</dd></div>
            <div><dt>Designation</dt><dd>{emp.designation || '—'}</dd></div>
            <div><dt>Location</dt><dd>{emp.location || '—'}</dd></div>
            {emp.email && <div><dt>Email</dt><dd>{emp.email}</dd></div>}
            {emp.phone && <div><dt>Phone</dt><dd>{emp.phone}</dd></div>}
          </dl>
        </div>
        <div className="text-center px-6 py-3.5 rounded-xl bg-brand-soft [&_strong]:block [&_strong]:text-3xl [&_strong]:text-brand [&_strong]:tabular-nums [&_span]:text-xs [&_span]:text-muted">
          <strong>{held}</strong>
          <span>items held</span>
        </div>
      </section>

      <section className={tw.card}>
        <div className={tw.tabs}>
          <button className={tab === 'assigned' ? 'active' : ''} onClick={() => setTab('assigned')}>
            Assigned Items ({active.length})
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            History ({history.length})
          </button>
          <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
            All Assignments ({assignments.length})
          </button>
        </div>

        {tab === 'assigned' &&
          (active.length ? (
            <div className={tw.tableWrap}>
              <table className={tw.table}>
                <thead>
                  <tr><th>#</th><th>Item</th><th>Category</th><th className="text-right tabular-nums">Quantity</th><th>Issue Date</th><th>Notes</th><th className="text-right">Action</th></tr>
                </thead>
                <tbody>
                  {active.map((a, i) => (
                    <tr key={a._id}>
                      <td className="text-muted">{i + 1}</td>
                      <td>{a.itemName}</td>
                      <td>{a.category}</td>
                      <td className="text-right tabular-nums font-semibold">
                        {a.outstandingQuantity}
                        {a.returnedQuantity > 0 && <small className="text-muted"> / {a.quantity}</small>}
                      </td>
                      <td>{fmtDate(a.issueDate)}</td>
                      <td className="text-muted">{a.notes || '—'}</td>
                      <td className="text-right">
                        <button className={tw.btnSm} onClick={() => setReturning(a)}>
                          <Icon name="undo" size={14} /> Return
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No items currently assigned.</Empty>
          ))}

        {tab === 'history' &&
          (history.length ? (
            <ul className="list-none m-0 px-5 pt-1 pb-4 [&_li]:flex [&_li]:gap-3 [&_li]:py-3 [&_li]:border-b [&_li]:border-line [&_li:last-child]:border-b-0 [&_small]:block [&_small]:text-muted [&_small]:mt-0.5">
              {history.map((h) => (
                <li key={h._id}>
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${h.type === 'ASSIGN' ? 'bg-brand' : 'bg-ok'}`} />
                  <div>
                    <strong>{h.type === 'ASSIGN' ? 'Issued' : 'Returned'}</strong> {h.quantity} × {h.itemName}
                    <small>
                      {fmtDate(h.date)} · {h.departmentName}
                      {h.notes ? ` · ${h.notes}` : ''}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No history yet.</Empty>
          ))}

        {tab === 'all' &&
          (assignments.length ? (
            <div className={tw.tableWrap}>
              <table className={tw.table}>
                <thead>
                  <tr><th>Item</th><th className="text-right tabular-nums">Issued</th><th className="text-right tabular-nums">Returned</th><th>Issue Date</th><th>Returns</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a._id}>
                      <td>{a.itemName}</td>
                      <td className="text-right tabular-nums">{a.quantity}</td>
                      <td className="text-right tabular-nums">{a.returnedQuantity}</td>
                      <td>{fmtDate(a.issueDate)}</td>
                      <td className="text-muted text-[12.5px]">
                        {a.returns.length ? a.returns.map((r) => `${r.quantity} on ${fmtDate(r.returnDate)}`).join(', ') : '—'}
                      </td>
                      <td><StatusBadge status={assignmentStatus(a)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No assignments yet.</Empty>
          ))}
      </section>

      {returning && (
        <Modal title="Return Item" onClose={() => setReturning(null)} width={520}>
          <ReturnForm assignment={returning} onCancel={() => setReturning(null)} onDone={() => { setReturning(null); reload(); }} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Employee" onClose={() => setEditing(false)} width={640}>
          <EmployeeForm initial={emp} onCancel={() => setEditing(false)} onSaved={(saved) => { setEditing(false); saved.employeeId !== emp.employeeId ? navigate(`/employees/${saved.employeeId}`, { replace: true }) : reload(); }} />
        </Modal>
      )}
    </>
  );
}
